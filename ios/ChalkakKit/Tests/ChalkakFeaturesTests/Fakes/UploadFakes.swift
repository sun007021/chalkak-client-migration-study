import Foundation
import Synchronization
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

// 업로드(UPL)·편집(EDIT) ViewModel 테스트용 Fake와 하네스.
// 기다림은 모두 CallSignal/Hold(취소 협조)로 하고, 실시간 sleep이나 양보 횟수에 기대지 않는다.

enum UploadFixtures {
    static let topicDate = KSTDate(year: 2026, month: 10, day: 27)!
    static let nextTopicDate = KSTDate(year: 2026, month: 10, day: 28)!
    static let topicId = UUID(uuidString: "11111111-1111-4111-8111-111111111127")!
    static let postId = UUID(uuidString: "22222222-2222-4222-8222-222222222201")!
    static let uploadId1 = UUID(uuidString: "55555555-5555-4555-8555-555555555501")!
    static let uploadId2 = UUID(uuidString: "55555555-5555-4555-8555-555555555502")!
    static let uploadId3 = UUID(uuidString: "55555555-5555-4555-8555-555555555503")!

    static func policy(id: UUID = uploadId1, maxBytes: Int64 = 5_242_880, contentType: String = "image/webp", expiresInSeconds: Int = 300) -> PostUploadPolicy {
        PostUploadPolicy(
            uploadId: id, uploadUrl: URL(string: "https://upload.test/\(id.uuidString.lowercased())")!,
            expiresInSeconds: expiresInSeconds, contentType: contentType, maxBytes: maxBytes
        )
    }

    static func topic(title: String = "가을 하늘", date: KSTDate = topicDate) -> Topic {
        Topic(id: topicId, title: title, topicDate: date, startsAt: Date(timeIntervalSince1970: 0), endsAt: Date(timeIntervalSince1970: 3600), phase: .open)
    }

    static func photo(_ n: Int = 1, size: PixelSize = PixelSize(width: 4000, height: 3000)) -> LoadedPhoto {
        LoadedPhoto(id: UUID(uuidString: "66666666-6666-4666-8666-" + String(format: "%012d", n))!, size: size)
    }

    /// 사진 선택기가 준 바이트 대용(내용은 Fake 로더가 해석한다).
    static let bytes = Data([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3])

    static let posted = TodayPostStatus(topicDate: topicDate, isPosted: true, postId: postId, moderationStatus: .pending)
    static let notPosted = TodayPostStatus(topicDate: topicDate, isPosted: false, postId: nil, moderationStatus: nil)
}

/// fixture의 상태·본문을 `APIError`로(실제 파서와 같은 경로).
func uploadAPIError(_ name: String) throws -> APIError {
    let fixture = try Fixture.load(name)
    guard let status = fixture.status else { throw FixtureError.malformed("\(name): status 없음") }
    return ErrorResponseParser.parse(status: status, body: fixture.body)
}

/// fixture 본문의 `message`(서버가 그대로 보여 주라고 한 문구).
func uploadFixtureMessage(_ name: String) throws -> String {
    guard let message = try Fixture.load(name).object()["message"] as? String else { throw FixtureError.malformed("\(name): message 없음") }
    return message
}

// MARK: Fake 저장소

/// 업로드 저장소 Fake. 호출마다 대본 결과를 순서대로 돌려주고(마지막은 반복), 호출 기록과 진입 신호를 남긴다.
/// 각 호출은 `Hold`가 있으면 열릴 때까지 멈춘다(취소 협조 또는 무시).
/// 업로드 저장소 + HOME 오늘 상태 포트를 한 Fake가 맡아 호출 순서(`order`)를 함께 남긴다.
actor FakePostCreationRepository: PostCreationRepository, TodayPostRepository {
    struct UploadCall: Sendable, Equatable {
        let data: Data
        let policy: PostUploadPolicy
    }
    struct CreateCall: Sendable, Equatable {
        let topicId: UUID
        let uploadId: UUID
        let rawTitle: String
    }

    private var todayResults: [Result<TodayPostStatus, any Error>] = [.success(UploadFixtures.notPosted)]
    private var issueResults: [Result<PostUploadPolicy, any Error>] = [.success(UploadFixtures.policy())]
    private var uploadResults: [Result<Void, any Error>] = [.success(())]
    private var createResults: [Result<CreatedPost, any Error>] = [.success(CreatedPost(postId: UploadFixtures.postId, status: .pending))]
    private var todayHold: Hold?
    private var issueHold: Hold?
    private var uploadHold: Hold?
    private var createHold: Hold?

    let todayEntered = CallSignal()
    let issueEntered = CallSignal()
    let uploadEntered = CallSignal()
    let createEntered = CallSignal()

    private(set) var todayCount = 0
    private(set) var issueCount = 0
    private(set) var uploadCalls: [UploadCall] = []
    private(set) var createCalls: [CreateCall] = []
    /// 호출 순서("today", "issue", "upload", "create").
    private(set) var order: [String] = []

    func setToday(_ results: [Result<TodayPostStatus, any Error>], hold: Hold? = nil) { todayResults = results; todayHold = hold }
    func setIssue(_ results: [Result<PostUploadPolicy, any Error>], hold: Hold? = nil) { issueResults = results; issueHold = hold }
    func setUpload(_ results: [Result<Void, any Error>], hold: Hold? = nil) { uploadResults = results; uploadHold = hold }
    func setCreate(_ results: [Result<CreatedPost, any Error>], hold: Hold? = nil) { createResults = results; createHold = hold }

    private func next<T>(_ results: inout [Result<T, any Error>]) -> Result<T, any Error> {
        results.count > 1 ? results.removeFirst() : results[0]
    }

    func todayStatus() async throws -> TodayPostStatus {
        todayCount += 1
        order.append("today")
        let result = next(&todayResults)
        let hold = todayHold
        await todayEntered.fire()
        try await hold?.wait()
        return try result.get()
    }

    func issueUpload() async throws -> PostUploadPolicy {
        issueCount += 1
        order.append("issue")
        let result = next(&issueResults)
        let hold = issueHold
        await issueEntered.fire()
        try await hold?.wait()
        return try result.get()
    }

    func uploadImage(_ data: Data, policy: PostUploadPolicy) async throws {
        uploadCalls.append(UploadCall(data: data, policy: policy))
        order.append("upload")
        let result = next(&uploadResults)
        let hold = uploadHold
        await uploadEntered.fire()
        try await hold?.wait()
        try result.get()
    }

    func createPost(topicId: UUID, uploadId: UUID, rawTitle: String) async throws -> CreatedPost {
        createCalls.append(CreateCall(topicId: topicId, uploadId: uploadId, rawTitle: rawTitle))
        order.append("create")
        let result = next(&createResults)
        let hold = createHold
        await createEntered.fire()
        try await hold?.wait()
        return try result.get()
    }

    var uploadIdsCreated: [UUID] { createCalls.map(\.uploadId) }
}

/// 사진 로더 Fake. 빈 데이터는 `unreadable`. 호출마다 다른 사진/지연을 줄 수 있다.
actor FakePhotoLoader: PhotoLoading {
    private(set) var loadedData: [Data] = []
    private(set) var released: [LoadedPhoto] = []
    let entered = CallSignal()
    /// (호출 순번 0부터, 바이트) → 결과. 기본은 호출 순번별 고유 사진(4000×3000).
    private var handler: @Sendable (Int, Data) async throws -> LoadedPhoto = { index, data in
        if data.isEmpty { throw PhotoLoadError.unreadable }
        return UploadFixtures.photo(index + 1)
    }

    func setHandler(_ handler: @escaping @Sendable (Int, Data) async throws -> LoadedPhoto) { self.handler = handler }

    func load(_ data: Data) async throws -> LoadedPhoto {
        let index = loadedData.count
        loadedData.append(data)
        await entered.fire()
        return try await handler(index, data)
    }

    func release(_ photo: LoadedPhoto) async { released.append(photo) }
}

/// 사진 준비 Fake. 결과 파일은 `live`에 있다가 `discard`되면 사라진다. 취소 협조 Hold를 쓰면 취소 시 파일을 만들지 않는다.
actor FakePhotoPreparer: PhotoPreparing {
    struct Call: Sendable, Equatable {
        let photo: LoadedPhoto
        let edit: PhotoEdit
        let maxBytes: Int64
    }

    private(set) var calls: [Call] = []
    private(set) var created: [PreparedImage] = []
    private(set) var discarded: [PreparedImage] = []
    let entered = CallSignal()
    private var holds: [Hold?] = []
    private var failures: [(any Error)?] = []
    private var byteCounts: [Int64] = [1_000_000]
    private var imagesByCall: [Int: PreparedImage] = [:]
    private(set) var contentRequests: [PreparedImage] = []
    /// 결과 파일을 만든 직후마다 올라간다(완료 순서를 고정하는 데 쓴다).
    let completed = CallSignal()

    /// 호출 순번(0부터)이 만든 결과 파일. 아직 안 만들었으면 nil.
    func image(forCall index: Int) -> PreparedImage? { imagesByCall[index] }

    /// 호출 순번별 멈춤 지점(없으면 바로 끝). 순번을 넘으면 마지막을 반복하지 않고 멈춤 없음.
    func setHolds(_ holds: [Hold?]) { self.holds = holds }
    /// 호출 순번별 실패(nil이면 성공).
    func setFailures(_ failures: [(any Error)?]) { self.failures = failures }
    /// 호출 순번별 결과 파일 크기(마지막을 반복).
    func setByteCounts(_ counts: [Int64]) { byteCounts = counts }

    var live: [PreparedImage] { created.filter { image in !discarded.contains(image) } }
    var callCount: Int { calls.count }

    func prepare(_ photo: LoadedPhoto, edit: PhotoEdit, maxBytes: Int64) async throws -> PreparedImage {
        let index = calls.count
        calls.append(Call(photo: photo, edit: edit, maxBytes: maxBytes))
        let hold = index < holds.count ? holds[index] : nil
        let failure = index < failures.count ? failures[index] : nil
        let bytes = index < byteCounts.count ? byteCounts[index] : byteCounts[byteCounts.count - 1]
        await entered.fire()
        try await hold?.wait()
        if let failure { throw failure }
        let image = PreparedImage(id: UUID(uuidString: "77777777-7777-4777-8777-" + String(format: "%012d", index + 1))!, byteCount: bytes)
        created.append(image)
        imagesByCall[index] = image
        await completed.fire()
        return image
    }

    func contents(of image: PreparedImage) async throws -> Data {
        contentRequests.append(image)
        return Data(repeating: 7, count: 8)
    }

    func discard(_ image: PreparedImage) async { discarded.append(image) }
}

/// 촬영본 앨범 저장 Fake.
actor FakeGallery: CapturedPhotoSaving {
    struct SaveFailed: Error {}
    struct Save: Sendable, Equatable {
        let data: Data
        let fileName: String
    }
    private(set) var saves: [Save] = []
    let entered = CallSignal()
    private var hold: Hold?
    private var shouldFail = false

    func configure(hold: Hold? = nil, fail: Bool = false) { self.hold = hold; shouldFail = fail }

    func save(_ jpeg: Data, fileName: String) async throws {
        saves.append(Save(data: jpeg, fileName: fileName))
        let hold = hold
        await entered.fire()
        try await hold?.wait()
        if shouldFail { throw SaveFailed() }
    }
}

/// 화면 밖 토스트 기록.
@MainActor
final class RecordingGlobalNotices: GlobalNoticePosting {
    private(set) var messages: [String] = []
    func postNotice(_ message: String) { messages.append(message) }
}

/// 편집기 준비 Fake.
actor FakeEditPreparer: PhotoEditPreparing {
    struct Failed: Error {}
    private(set) var callCount = 0
    private var failFirst = 0
    let entered = CallSignal()

    func failFirstCalls(_ count: Int) { failFirst = count }

    func preparePreview(for photo: LoadedPhoto) async throws {
        callCount += 1
        await entered.fire()
        if callCount <= failFirst { throw Failed() }
    }
}

/// 자동 보정 분석 Fake.
actor FakeAutoAdjuster: PhotoAutoAdjusting {
    struct Call: Sendable, Equatable {
        let quarterTurns: Int
        let crop: CropWindow
    }
    private(set) var calls: [Call] = []
    let entered = CallSignal()
    private var result: [AdjustmentKind: Double]?

    init(result: [AdjustmentKind: Double]? = [.exposure: 0.4, .contrast: 0.2]) { self.result = result }

    func setResult(_ result: [AdjustmentKind: Double]?) { self.result = result }

    func analyze(_ photo: LoadedPhoto, quarterTurns: Int, crop: CropWindow) async -> [AdjustmentKind: Double]? {
        calls.append(Call(quarterTurns: quarterTurns, crop: crop))
        await entered.fire()
        return result
    }

    var callCount: Int { calls.count }
}

/// WebP 압축 Fake: 품질·크기별 결과 크기 표. 호출을 기록한다.
actor FakeCompressor: WebPCompressing {
    struct Attempt: Sendable, Equatable {
        let quality: Int
        let size: PixelSize
    }
    private(set) var attempts: [Attempt] = []
    let entered = CallSignal()
    private let byteCount: @Sendable (Attempt) -> Int
    private var hold: Hold?

    init(byteCount: @escaping @Sendable (Attempt) -> Int) { self.byteCount = byteCount }

    func setHold(_ hold: Hold?) { self.hold = hold }

    func compress(quality: Int, size: PixelSize) async throws -> Data {
        let attempt = Attempt(quality: quality, size: size)
        attempts.append(attempt)
        let hold = hold
        await entered.fire()
        try await hold?.wait()
        return Data(count: byteCount(attempt))
    }
}

// MARK: 하네스

/// 업로드 화면 ViewModel과 의존성 묶음. 시계는 KST 2026-10-27 정오(`TestClock`, 가상 시간).
@MainActor
struct UploadWorld {
    let topics = FakeTopicRepository()
    let creation = FakePostCreationRepository()
    let loader = FakePhotoLoader()
    let preparer = FakePhotoPreparer()
    let gallery = FakeGallery()
    let globalNotices = RecordingGlobalNotices()
    let analytics = RecordingAnalytics()
    let clock: TestClock

    init(now: Date = FeedFixtures.noon(UploadFixtures.topicDate)) {
        clock = TestClock(now: now)
    }

    /// 주제 조회가 `UploadFixtures.topic`(id 1111…27, 요청 날짜 그대로)을 돌려주게 한다.
    func useTopic(title: String = "가을 하늘") async {
        await topics.setHandler { UploadFixtures.topic(title: title, date: $0) }
    }

    func makeViewModel(topicDate: KSTDate = UploadFixtures.topicDate) -> UploadViewModel {
        UploadViewModel(
            topicDate: topicDate, topics: topics, creation: creation, today: creation, photoLoader: loader, preparer: preparer,
            gallery: gallery, globalNotices: globalNotices, clock: clock, screenTracker: ScreenTracker(tracker: analytics)
        )
    }

    /// 사진 고르기 → 편집기 완료(편집 없음)까지 진행해 준비를 시작시킨 상태의 ViewModel을 만든다.
    func makeViewModelWithPhoto(edit: PhotoEdit = .identity) async -> UploadViewModel {
        await useTopic()
        let vm = makeViewModel()
        await vm.loadTopic()
        await vm.photoPicked(UploadFixtures.bytes, source: .album)
        vm.editorClosed(.completed(edit))
        return vm
    }
}

extension UploadViewModel {
    /// 백그라운드 작업이 진행 중인 동안 `signal`이 올라가는지 본다. 작업이 먼저 끝나 버리면(스텁·조기 실패) false를 돌려 테스트가 바로 실패하게 한다.
    func reaches(_ signal: CallSignal, atLeast count: Int = 1) async -> Bool {
        let settle = Task { @MainActor in await self.waitForBackgroundWork() }
        return await EventWait.signal(signal, atLeast: count, before: settle)
    }
}

extension TodayPostStatus {
    static func notPosted(on date: KSTDate) -> TodayPostStatus { TodayPostStatus(topicDate: date, isPosted: false, postId: nil, moderationStatus: nil) }
    static func posted(on date: KSTDate, status: ModerationStatus) -> TodayPostStatus {
        TodayPostStatus(topicDate: date, isPosted: true, postId: UploadFixtures.postId, moderationStatus: status)
    }
}
