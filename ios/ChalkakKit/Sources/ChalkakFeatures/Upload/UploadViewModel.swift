import Foundation
import Observation
import ChalkakCore
import ChalkakNetwork
import ChalkakData

/// 성공 화면에 필요한 값.
public struct UploadSuccess: Sendable, Equatable {
    public let topicDate: KSTDate
    public let topicTitle: String
    public let status: ModerationStatus
    /// "‘{주제}’을/를 기록했어요."
    public let message: String
    /// PENDING이면 pending 문구, 그 밖(VALIDATING, 복구에서 본 APPROVED)이면 validating 문구.
    public let statusMessage: String
    public init(topicDate: KSTDate, topicTitle: String, status: ModerationStatus, message: String, statusMessage: String) {
        self.topicDate = topicDate
        self.topicTitle = topicTitle
        self.status = status
        self.message = message
        self.statusMessage = statusMessage
    }
}

/// 업로드 화면(screen_view `photo_upload`) + 성공 화면(`photo_upload_success`)의 ViewModel.
///
/// 흐름 요약(구현 기준: docs/spec/features/upload-edit.md, decisions D-02·D-07·D-14·D-20·D-21):
/// - 주제: `loadTopic()` = `GET /topics?date=<topicDate>`. 응답 `topicDate`가 요청과 다르면 실패. 실패는 `topic = .failed`, "다시 시도"는 `retryTopic()`.
/// - 사진: `photoPicked`로 받은 바이트를 `PhotoLoading.load`로 확인 → 성공하면 `editor`(첫 선택) 요청. 읽을 수 없으면 `errorPrepare`. 가장 최근 선택만 반영.
///   카메라 촬영본은 앨범에 한 번만 저장(실패는 토스트 `cameraSaveFailed`, 화면을 나간 뒤면 `GlobalNoticePosting`).
/// - 편집 끝(`editorClosed(.completed)`): 곧바로 백그라운드 준비 = `issueUpload` → `isWebP` 확인 → `PhotoPreparing.prepare`. 같은 사진·같은 편집값이면 다시 준비하지 않는다.
///   취소(`.cancelled`): 첫 선택이면 사진을 버리고, 재편집이면 이전 선택·준비 결과 유지.
/// - 제출: 준비 완료를 기다림 → 정책 만료(`ExpiringDeadline`, 단조 시계) 확인·재발급 → `uploadImage` → `createPost`.
///   `POST` 응답 유실(`APIError.network`)은 재전송 없이 `todayStatus`로 복구(D-07). `POST` 400은 `todayStatus`로 판정(D-02).
/// - `waitForBackgroundWork()`: 테스트·종료 대기용. 준비·촬영본 저장 같은 백그라운드 작업이 모두 끝나면 돌아온다.
///   호출한 Task가 취소돼도 **기다림만 접고** 작업은 취소하지 않는다.
@MainActor
@Observable
public final class UploadViewModel {
    public enum TopicState: Sendable, Equatable {
        case loading
        case loaded(Topic)
        case failed(Notice)
    }

    /// 사진 준비(백그라운드) 상태.
    public enum Preparation: Sendable, Equatable {
        case none
        case issuingPolicy
        case encoding
        case ready
        case failed(Notice)
    }

    /// 편집기를 띄워 달라는 요청.
    public struct EditorRequest: Sendable, Equatable {
        public let photo: LoadedPhoto
        public let initialEdit: PhotoEdit
        /// true면 방금 고른 사진의 첫 편집(취소하면 사진 선택이 취소된다).
        public let isFirstSelection: Bool
        /// 요청 식별자. `editorClosed(_:requestID:)`가 오래된 요청의 결과를 거른다. 같음 비교에는 쓰지 않는다.
        public let id: Int
        public init(photo: LoadedPhoto, initialEdit: PhotoEdit, isFirstSelection: Bool, id: Int = 0) {
            self.photo = photo
            self.initialEdit = initialEdit
            self.isFirstSelection = isFirstSelection
            self.id = id
        }
        public static func == (lhs: EditorRequest, rhs: EditorRequest) -> Bool {
            lhs.photo == rhs.photo && lhs.initialEdit == rhs.initialEdit && lhs.isFirstSelection == rhs.isFirstSelection
        }
    }

    // MARK: 상태

    /// 게이트가 고정해 준 주제 날짜. 자정이 지나도 바뀌지 않는다.
    public let topicDate: KSTDate
    public private(set) var topic: TopicState = .loading
    public private(set) var photo: LoadedPhoto?
    public private(set) var edit: PhotoEdit = .identity
    public private(set) var editor: EditorRequest?
    public private(set) var preparation: Preparation = .none
    /// 제목 입력 원문(`PostTitle.clampedInput`으로 길이만 제한, 공백은 보존).
    public private(set) var title = ""
    public private(set) var isSubmitting = false
    /// 화면 안 오류 문구(제출·준비 실패 등). 제출을 다시 시작하면 지운다.
    public private(set) var notice: Notice?
    /// 화면이 보이는 동안의 토스트(촬영본 저장 실패).
    public private(set) var toast: Notice?
    public private(set) var success: UploadSuccess?
    /// 재인증이 필요해 로그인 화면으로 보내야 한다(입력은 유지, 준비한 파일·정책은 버림).
    public private(set) var needsLogin = false

    /// "전시하기" 활성: 사진이 있고, 제출 중이 아니고, 성공 전. 준비 중·준비 실패여도 활성이다(REQ-UPL-037).
    public var isSubmitEnabled: Bool { photo != nil && !isSubmitting && success == nil }
    /// 제출 중이면 "전시 중...", 아니면 "전시하기".
    public var submitTitle: String { isSubmitting ? UploadCopy.submitting : UploadCopy.submit }

    // MARK: 내부 상태(화면이 읽지 않는다)

    /// 준비가 끝난 업로드 한 벌: 정책(+발급 시각 기준 만료) + 임시 WebP 파일.
    private struct Prepared {
        var policy: PostUploadPolicy
        var deadline: ExpiringDeadline
        var image: PreparedImage
        /// 이 `uploadId`로 PUT이 이미 성공했다(응답 유실 뒤 재제출은 POST만 보낸다, D-07).
        var isUploaded = false
        /// PUT이 거절됐다: 다음 제출은 정책 발급부터 다시 한다(REQ-UPL-059).
        var needsNewPolicy = false
    }

    /// 제출을 멈추는 사유. 화면 상태 변경은 `runSubmit`의 catch 한 곳에서 한다.
    private enum Stop: Error {
        /// 화면 이탈·취소: 아무것도 보이지 않는다.
        case cancelled
        /// 재인증 필요: 로그인 화면으로.
        case login
        /// 안내만 보이고 준비 상태는 그대로.
        case show(String)
        /// 안내를 보이고 준비(정책·파일)를 처음부터 다시 하게 한다.
        case showAndReset(String)
    }

    @ObservationIgnored private var prepared: Prepared?
    @ObservationIgnored private var prepareTask: Task<Void, Never>?
    @ObservationIgnored private var prepareGeneration = 0
    @ObservationIgnored private var pickGeneration = 0
    @ObservationIgnored private var closed = false
    @ObservationIgnored private var editorRequestCount = 0
    @ObservationIgnored private var notices = NoticeSequence()
    @ObservationIgnored private let work = ActiveWork()
    @ObservationIgnored private let background = BackgroundTasks()

    private let topics: any TopicRepository
    private let creation: any PostCreationRepository
    private let today: any TodayPostRepository
    private let photoLoader: any PhotoLoading
    private let preparer: any PhotoPreparing
    private let gallery: any CapturedPhotoSaving
    private let globalNotices: any GlobalNoticePosting
    private let clock: any AppClock
    private let screenTracker: ScreenTracker?

    public init(
        topicDate: KSTDate,
        topics: any TopicRepository,
        creation: any PostCreationRepository,
        today: any TodayPostRepository,
        photoLoader: any PhotoLoading,
        preparer: any PhotoPreparing,
        gallery: any CapturedPhotoSaving,
        globalNotices: any GlobalNoticePosting,
        clock: any AppClock,
        screenTracker: ScreenTracker?
    ) {
        self.topicDate = topicDate
        self.topics = topics
        self.creation = creation
        self.today = today
        self.photoLoader = photoLoader
        self.preparer = preparer
        self.gallery = gallery
        self.globalNotices = globalNotices
        self.clock = clock
        self.screenTracker = screenTracker
    }

    // MARK: 생명주기

    /// `screen_view(photo_upload)`.
    public func onAppear() {
        screenTracker?.screenAppeared(.photoUpload)
    }

    /// 화면을 나간다: 진행 중인 준비·제출을 취소하고 만든 임시 파일·보관한 원본을 지운다. 이후 성공 화면은 뜨지 않는다.
    /// 촬영본 저장은 취소하지 않는다(사진을 잃지 않게). 저장 실패가 이후에 나면 `GlobalNoticePosting`으로 알린다.
    public func close() async {
        guard !closed else { return }
        closed = true
        work.cancel()
        prepareGeneration += 1
        prepareTask?.cancel()
        prepareTask = nil
        pickGeneration += 1
        let image = prepared?.image
        prepared = nil
        var held: [LoadedPhoto] = []
        if let photo { held.append(photo) }
        if let editor, editor.isFirstSelection { held.append(editor.photo) }
        editor = nil
        if let image { await preparer.discard(image) }
        for photo in held { await photoLoader.release(photo) }
    }

    /// 백그라운드 작업(준비, 촬영본 저장)이 모두 끝날 때까지 기다린다. 호출 Task의 취소는 기다림만 접는다.
    public func waitForBackgroundWork() async {
        await background.waitUntilIdle()
    }

    // MARK: 주제

    public func loadTopic() async {
        await work.run { [self] in await fetchTopic() }
    }

    public func retryTopic() async {
        await loadTopic()
    }

    private func fetchTopic() async {
        topic = .loading
        do {
            let loaded = try await topics.topic(on: topicDate)
            guard !closed, !Task.isCancelled else { return }
            // 응답 날짜가 요청과 다르면 잘못된 응답이다.
            topic = loaded.topicDate == topicDate ? .loaded(loaded) : .failed(notices.make(UploadCopy.topicLoadFailed))
        } catch {
            guard !closed, !error.isCancellation, !Task.isCancelled else { return }
            switch error as? FeedFailure {
            case .unauthorized:
                needsLogin = true
                topic = .failed(notices.make(UploadCopy.topicLoadFailed))
            case .network:
                topic = .failed(notices.make(UploadCopy.errorNetwork))
            default:
                topic = .failed(notices.make(UploadCopy.topicLoadFailed))
            }
        }
    }

    // MARK: 사진 선택·편집

    /// 앨범·카메라가 준 바이트. 편집기를 먼저 연다(REQ-UPL-017).
    public func photoPicked(_ data: Data, source: PhotoSource) async {
        guard !closed, !isSubmitting, success == nil else { return }
        pickGeneration += 1
        let generation = pickGeneration
        notice = nil
        if source == .camera { saveCapture(data) }
        let loaded: LoadedPhoto
        do {
            loaded = try await photoLoader.load(data)
        } catch {
            guard generation == pickGeneration, !closed, !error.isCancellation else { return }
            notice = notices.make(UploadCopy.errorPrepare)
            return
        }
        // 더 최근 선택이 있거나 화면을 나갔으면 이 결과는 버리고 원본을 놓는다.
        guard generation == pickGeneration, !closed, !isSubmitting, success == nil else {
            await photoLoader.release(loaded)
            return
        }
        if let previous = editor, previous.isFirstSelection { release(previous.photo) }
        editor = makeEditorRequest(photo: loaded, initialEdit: .identity, isFirstSelection: true)
    }

    /// 촬영본은 앨범에 한 번만 저장한다. 늦게 끝난 실패는 화면을 나갔으면 전역 토스트로 알린다.
    private func saveCapture(_ jpeg: Data) {
        let name = CapturedPhotoName.make(at: clock.now, id: UUID())
        background.start { [self] in
            do {
                try await gallery.save(jpeg, fileName: name)
            } catch {
                guard !error.isCancellation else { return }
                if closed {
                    globalNotices.postNotice(UploadCopy.cameraSaveFailed)
                } else {
                    toast = notices.make(UploadCopy.cameraSaveFailed)
                }
            }
        }
    }

    private func release(_ photo: LoadedPhoto) {
        background.start { [self] in await photoLoader.release(photo) }
    }

    /// 업로드 화면의 사진을 탭: 현재 편집값으로 편집기를 다시 연다(REQ-UPL-021).
    public func photoTapped() {
        guard let photo, editor == nil, !isSubmitting, success == nil, !closed else { return }
        editor = makeEditorRequest(photo: photo, initialEdit: edit, isFirstSelection: false)
    }

    private func makeEditorRequest(photo: LoadedPhoto, initialEdit: PhotoEdit, isFirstSelection: Bool) -> EditorRequest {
        editorRequestCount += 1
        return EditorRequest(photo: photo, initialEdit: initialEdit, isFirstSelection: isFirstSelection, id: editorRequestCount)
    }

    /// 편집기가 닫혔다(`PhotoEditViewModel.outcome`).
    /// `requestID`를 주면 현재 편집기 요청과 같을 때만 반영한다(오래된 요청의 늦은 결과 무시).
    public func editorClosed(_ outcome: PhotoEditViewModel.Outcome, requestID: Int? = nil) {
        guard let request = editor else { return }
        if let requestID, requestID != request.id { return }
        editor = nil
        // 제출 중·성공 뒤에는 준비물을 바꿀 수 없어 취소로 취급한다.
        if closed || isSubmitting || success != nil {
            if request.isFirstSelection { release(request.photo) }
            return
        }
        switch outcome {
        case .cancelled:
            // 처음 고른 사진이면 선택을 취소하고, 다시 편집 중이면 이전 상태를 그대로 둔다.
            if request.isFirstSelection { release(request.photo) }
        case let .completed(newEdit):
            if request.photo == photo {
                guard newEdit != edit else { return }
                edit = newEdit
            } else {
                if let old = photo { release(old) }
                photo = request.photo
                edit = newEdit
            }
            startPreparation()
        }
    }

    // MARK: 사진 준비(정책 발급 + 인코딩)

    /// 이전 준비를 취소·폐기하고 새로 시작한다. 늦게 끝난 이전 작업은 세대 번호로 걸러진다.
    private func startPreparation() {
        prepareTask?.cancel()
        prepareGeneration += 1
        let generation = prepareGeneration
        let previous = prepared
        prepared = nil
        guard let photo else { return }
        let edit = edit
        preparation = .issuingPolicy
        prepareTask = background.start { [self] in
            if let previous { await preparer.discard(previous.image) }
            await runPreparation(photo: photo, edit: edit, generation: generation)
        }
    }

    private func isCurrent(_ generation: Int) -> Bool {
        generation == prepareGeneration && !closed && !Task.isCancelled
    }

    private func runPreparation(photo: LoadedPhoto, edit: PhotoEdit, generation: Int) async {
        var image: PreparedImage?
        do {
            let policy = try await creation.issueUpload()
            let deadline = ExpiringDeadline(issuedAtUptime: clock.uptime, expiresIn: policy.expiresIn)
            guard isCurrent(generation) else { return }
            guard policy.isWebP else { throw PhotoPrepareError.unsupported }
            preparation = .encoding
            let encoded = try await preparer.prepare(photo, edit: edit, maxBytes: policy.maxBytes)
            image = encoded
            guard isCurrent(generation) else {
                await preparer.discard(encoded)
                return
            }
            prepared = Prepared(policy: policy, deadline: deadline, image: encoded)
            preparation = .ready
        } catch {
            if let image { await preparer.discard(image) }
            guard generation == prepareGeneration, !closed, !error.isCancellation else { return }
            switch prepareFailure(error) {
            case .login:
                needsLogin = true
                preparation = .none
            case let .show(message), let .showAndReset(message):
                preparation = .failed(notices.make(message))
            case .cancelled:
                break
            }
        }
    }

    /// 정책 발급·인코딩 단계의 실패를 화면 동작으로 옮긴다(분기는 status로만, D-02·D-20).
    private func prepareFailure(_ error: any Error) -> Stop {
        if error.isCancellation { return .cancelled }
        if case let APIError.http(status, _, _) = error {
            if status == 401 { return .login }
            if status == 403 { return .show(UploadCopy.banned) }
        }
        if case APIError.network = error { return .show(UploadCopy.errorNetwork) }
        return .show(UploadCopy.errorPrepare)
    }

    // MARK: 제목

    /// 입력 중에는 공백을 그대로 두고 길이만 막는다(10 code point). 앞뒤 공백 제거는 제출 때 한다(D-01, REQ-UPL-022·023).
    public func setTitle(_ proposed: String) {
        guard !isSubmitting, success == nil else { return }
        title = PostTitle.clampedInput(proposed)
    }

    /// 제출될 제목: 앞뒤 공백을 뗀 값, 비면 nil(제목 없음).
    public var normalizedTitle: String? { PostTitle.normalized(title) }

    // MARK: 제출

    /// "전시하기". 제출 중·성공 후의 호출은 무시한다. 실패해도 사진·제목은 유지한다.
    public func submit() async {
        guard photo != nil, !isSubmitting, success == nil, !closed else { return }
        isSubmitting = true
        notice = nil
        await work.run { [self] in await runSubmit() }
        isSubmitting = false
    }

    /// 성공 화면 "확인했어요.": 전시 탭에서 열 날짜(업로드한 `topicDate`)를 돌려준다. 성공 전이면 nil.
    public func confirmSuccess() -> KSTDate? { success == nil ? nil : topicDate }

    // MARK: 제출 내부

    private func runSubmit() async {
        do {
            try await performSubmit()
        } catch {
            guard !closed else { return }
            switch (error as? Stop) ?? .show(UploadCopy.errorCreate) {
            case .cancelled:
                break
            case .login:
                await dropPrepared()
                needsLogin = true
            case let .show(message):
                notice = notices.make(message)
            case let .showAndReset(message):
                await dropPrepared()
                notice = notices.make(message)
            }
        }
    }

    private func performSubmit() async throws {
        let loadedTopic = try await requireTopic()
        try ensureAlive()
        try await ensurePrepared()
        if prepared?.isUploaded != true {
            try await refreshPolicyIfNeeded()
            try await upload()
        }
        try await create(topic: loadedTopic)
    }

    private func ensureAlive() throws {
        if closed || Task.isCancelled { throw Stop.cancelled }
    }

    /// 주제를 아직 못 받았으면 먼저 받는다. 그래도 없으면 업로드하지 않고 멈춘다.
    private func requireTopic() async throws -> Topic {
        if case .loaded = topic {} else { await fetchTopic() }
        try ensureAlive()
        guard case let .loaded(loaded) = topic else {
            if case let .failed(failed) = topic { throw Stop.show(failed.message) }
            throw Stop.show(UploadCopy.topicLoadFailed)
        }
        return loaded
    }

    /// 준비가 진행 중이면 끝날 때까지 기다리고, 준비된 것이 없으면(실패·되돌림) 처음부터 다시 한다.
    private func ensurePrepared() async throws {
        if let task = prepareTask { await task.value }
        try ensureAlive()
        if prepared == nil {
            if needsLogin { throw Stop.login }
            startPreparation()
            if let task = prepareTask { await task.value }
            try ensureAlive()
        }
        guard prepared != nil else {
            switch preparation {
            case let .failed(failed):
                preparation = .none
                throw Stop.show(failed.message)
            default:
                if needsLogin { throw Stop.login }
                throw Stop.show(UploadCopy.errorPrepare)
            }
        }
    }

    /// URL 만료(단조 시계)이거나 PUT이 거절된 적이 있으면 새 정책을 받는다. 새 한도보다 파일이 크면 같은 편집값으로 다시 인코딩한다.
    private func refreshPolicyIfNeeded() async throws {
        guard let current = prepared, let photo else { throw Stop.cancelled }
        if !current.needsNewPolicy, current.deadline.isUsable(atUptime: clock.uptime) { return }
        let policy: PostUploadPolicy
        do {
            policy = try await creation.issueUpload()
        } catch {
            throw prepareFailure(error)
        }
        let deadline = ExpiringDeadline(issuedAtUptime: clock.uptime, expiresIn: policy.expiresIn)
        try ensureAlive()
        guard policy.isWebP else { throw Stop.showAndReset(UploadCopy.errorPrepare) }
        if current.image.byteCount <= policy.maxBytes {
            prepared = Prepared(policy: policy, deadline: deadline, image: current.image)
            return
        }
        let image: PreparedImage
        do {
            image = try await preparer.prepare(photo, edit: edit, maxBytes: policy.maxBytes)
        } catch {
            if error.isCancellation { throw Stop.cancelled }
            throw Stop.showAndReset(UploadCopy.errorPrepare)
        }
        guard !closed else {
            await preparer.discard(image)
            throw Stop.cancelled
        }
        await preparer.discard(current.image)
        prepared = Prepared(policy: policy, deadline: deadline, image: image)
        try ensureAlive()
    }

    private func upload() async throws {
        guard let current = prepared else { throw Stop.cancelled }
        // 한도를 넘는 파일은 보내지 않는다(REQ-UPL-044).
        guard current.image.byteCount <= current.policy.maxBytes else { throw Stop.showAndReset(UploadCopy.errorPrepare) }
        let data: Data
        do {
            data = try await preparer.contents(of: current.image)
        } catch {
            if error.isCancellation { throw Stop.cancelled }
            throw Stop.showAndReset(UploadCopy.errorPrepare)
        }
        try ensureAlive()
        // 보고된 크기가 아니라 실제 본문 크기로 한 번 더 막는다. 같은 파일로 반복되지 않게 준비를 되돌린다.
        guard Int64(data.count) <= current.policy.maxBytes else { throw Stop.showAndReset(UploadCopy.errorUpload) }
        do {
            try await creation.uploadImage(data, policy: current.policy)
        } catch {
            if error.isCancellation { throw Stop.cancelled }
            if case APIError.network = error { throw Stop.show(UploadCopy.errorNetwork) }
            if case PostUploadError.payloadTooLarge = error { throw Stop.showAndReset(UploadCopy.errorUpload) }
            // 거절·한도 초과·잘못된 URL: 이 정책은 버리고 다음 제출에서 새로 받는다.
            prepared?.needsNewPolicy = true
            throw Stop.show(UploadCopy.errorUpload)
        }
        try ensureAlive()
        prepared?.isUploaded = true
    }

    private func create(topic loadedTopic: Topic) async throws {
        guard let current = prepared else { throw Stop.cancelled }
        let created: CreatedPost
        do {
            created = try await creation.createPost(topicId: loadedTopic.id, uploadId: current.policy.uploadId, rawTitle: title)
        } catch {
            try await handleCreateFailure(error)
            return
        }
        try ensureAlive()
        try await finishSuccess(status: created.status, topic: loadedTopic)
    }

    /// 생성 실패 분기(POST는 재전송하지 않는다). 복구 확인으로 성공이 확인되면 정상 반환한다.
    private func handleCreateFailure(_ error: any Error) async throws {
        if error.isCancellation { throw Stop.cancelled }
        switch error {
        case APIError.network:
            try await recoverLostResponse(fallback: UploadCopy.errorNetwork)
        case APIError.invalidResponse:
            try await recoverLostResponse(fallback: UploadCopy.errorCreate)
        case let APIError.http(status, _, message):
            switch status {
            case 400: try await judgeBadRequest(serverMessage: message)
            case 401: throw Stop.login
            case 403: throw Stop.show(UploadCopy.banned)
            // 404(업로드·주제 없음)도 message가 아니라 today로 판정한다(D-02).
            case 404: try await judgeBadRequest(serverMessage: message)
            // 5xx에서 응답 유실 복구(today 확인)를 할지는 명세 확인 대상이라 지금은 일반 실패로 둔다.
            default: throw Stop.show(UploadCopy.errorCreate)
            }
        default:
            throw Stop.show(UploadCopy.errorCreate)
        }
    }

    /// D-07: 응답을 못 받았으면 `GET /posts/today`로 확인한다. 만들어졌으면 그 상태로 성공, 아니면 같은 uploadId로 다시 제출할 수 있다.
    private func recoverLostResponse(fallback: String) async throws {
        let result = try await fetchToday(otherwise: fallback)
        guard result.isPosted, let status = result.moderationStatus else { throw Stop.show(fallback) }
        guard result.topicDate == topicDate, case let .loaded(loaded) = topic else { throw Stop.showAndReset(UploadCopy.errorTopicChanged) }
        try await finishSuccess(status: status, topic: loaded)
    }

    /// D-02: 400·404는 message가 아니라 `GET /posts/today`로 판정한다.
    private func judgeBadRequest(serverMessage: String?) async throws {
        let result = try await fetchToday(otherwise: UploadCopy.errorCreate)
        // topicDate 불일치를 먼저 본다: 다른 날짜의 작성 여부는 이 제출의 중복 판정 근거가 아니다(REQ-UPL-053).
        // 둘 다 이 사진으로는 다시 낼 수 없어 준비물을 버린다.
        guard result.topicDate == topicDate else { throw Stop.showAndReset(UploadCopy.errorTopicChanged) }
        if result.isPosted { throw Stop.showAndReset(UploadCopy.errorDuplicate) }
        let message = serverMessage.flatMap { $0.isEmpty ? nil : $0 } ?? UploadCopy.errorCreate
        throw Stop.showAndReset(message)
    }

    /// 판정·복구용 today 조회(HOME의 `TodayPostRepository`). 실패는 `FeedFailure`로만 나눈다: 로그인, 정지, 주제 변경(notFound), 네트워크, 그 밖 `otherwise`.
    private func fetchToday(otherwise: String) async throws -> TodayPostStatus {
        do {
            let result = try await today.todayStatus()
            try ensureAlive()
            return result
        } catch {
            if error.isCancellation { throw Stop.cancelled }
            try ensureAlive()
            switch error as? FeedFailure {
            case .network: throw Stop.show(UploadCopy.errorNetwork)
            case .unauthorized: throw Stop.login
            case .banned: throw Stop.show(UploadCopy.banned)
            case .notFound: throw Stop.showAndReset(UploadCopy.errorTopicChanged)
            default: throw Stop.show(otherwise)
            }
        }
    }

    private func finishSuccess(status: ModerationStatus, topic loadedTopic: Topic) async throws {
        let image = prepared?.image
        prepared = nil
        preparation = .none
        if let image { await preparer.discard(image) }
        try ensureAlive()
        success = UploadSuccess(
            topicDate: topicDate, topicTitle: loadedTopic.title, status: status,
            message: UploadCopy.successTitle(topicTitle: loadedTopic.title),
            statusMessage: status == .pending ? UploadCopy.successPending : UploadCopy.successValidating
        )
        screenTracker?.screenAppeared(.photoUploadSuccess)
    }

    /// 정책·임시 파일을 버리고 준비 상태를 처음으로 돌린다(사진·제목은 그대로).
    private func dropPrepared() async {
        prepareGeneration += 1
        prepareTask?.cancel()
        prepareTask = nil
        let image = prepared?.image
        prepared = nil
        preparation = .none
        if let image { await preparer.discard(image) }
    }
}

/// 백그라운드 작업 목록. 대기자가 취소돼도 기다림만 접고 작업은 취소하지 않는다.
@MainActor
private final class BackgroundTasks {
    private var tasks: [Int: Task<Void, Never>] = [:]
    private var waiters: [Int: CheckedContinuation<Void, Never>] = [:]
    private var nextID = 0

    @discardableResult
    func start(_ body: @escaping @MainActor () async -> Void) -> Task<Void, Never> {
        nextID += 1
        let id = nextID
        let task = Task { @MainActor [self] in
            await body()
            finish(id)
        }
        tasks[id] = task
        return task
    }

    func waitUntilIdle() async {
        guard !tasks.isEmpty else { return }
        nextID += 1
        let id = nextID
        await withTaskCancellationHandler {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                if Task.isCancelled { continuation.resume() } else { waiters[id] = continuation }
            }
        } onCancel: {
            Task { @MainActor in self.cancelWaiter(id) }
        }
    }

    private func finish(_ id: Int) {
        tasks[id] = nil
        guard tasks.isEmpty else { return }
        let all = waiters.values
        waiters.removeAll()
        all.forEach { $0.resume() }
    }

    private func cancelWaiter(_ id: Int) {
        waiters.removeValue(forKey: id)?.resume()
    }
}
