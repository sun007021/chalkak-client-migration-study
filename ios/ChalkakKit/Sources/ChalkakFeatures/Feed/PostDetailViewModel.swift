import Foundation
import Observation
import ChalkakCore
import ChalkakData

/// 게시물 상세(피드)의 ViewModel. screen_view `feed`. 제목 수정·삭제·좋아요 포함.
///
/// 규칙 요약(구현 기준은 docs/spec/features/display-feed.md §게시물 상세·제목 수정·삭제, 테스트는 PostDetail*Tests):
/// - `listItem` 진입은 시드로 즉시 `.content`, `mine` 진입은 `.loading`. 상세 응답 전(`isConfirmed == false`)에는 좋아요·수정·삭제가 막힌다.
/// - 상세 응답은 `beginRevalidation()` 표식을 잡고 보낸 뒤 `merge`로 좋아요를 합치고, 그 사이 성공한 제목 수정은 덮지 않는다.
/// - 내 게시물 판정: 응답 전 = 진입 경로 값, 응답 후 = `authorId == viewer.userId`(D-26). 뷰어는 읽을 때마다 최신 값을 본다.
/// - 토스트는 화면이 보일 때만(D-20). 삭제 성공은 `dismissal`로 알리고 목록 쪽 제거는 `PostChangeLedger`로 한다.
@MainActor
@Observable
public final class PostDetailViewModel {
    public enum State: Sendable, Equatable {
        case loading
        case content
        /// 404 "게시물을 찾을 수 없어요"
        case notFound(Notice)
        /// 시드 없이 열렸는데 실패(404 외). 문구는 `FeedCopy.message(for:operation: .postDetail)`.
        case failed(Notice)
    }

    /// 제목 수정 다이얼로그 상태.
    public struct TitleEdit: Sendable, Equatable {
        public var text: String
        public var isSaving: Bool
        /// 저장 실패 사유(다이얼로그를 닫지 않고 입력을 유지한다).
        public var error: Notice?
        public init(text: String, isSaving: Bool = false, error: Notice? = nil) {
            self.text = text
            self.isSaving = isSaving
            self.error = error
        }
        /// 저장 버튼 문구: 저장 중에는 "저장 중...".
        public var saveButtonTitle: String { isSaving ? FeedDialogCopy.editSaving : FeedDialogCopy.editSave }
    }

    /// 화면을 닫아야 하는 이유(앱이 소비해 이전 화면으로 돌아간다).
    public enum Dismissal: Sendable, Equatable {
        /// 삭제 204. 토스트 "게시물을 삭제했어요"는 화면이 보일 때만 담긴다(없으면 nil).
        case deleted(toast: Notice?)
        /// 제목 수정·삭제 404 등으로 더는 볼 수 없다.
        case unavailable
    }

    // MARK: 상태

    public private(set) var state: State
    public let postId: UUID
    public private(set) var imageURL: URL?
    public private(set) var signatureURL: URL?
    public private(set) var title: String?
    /// 제목 없으면 "무제".
    public var displayTitle: String { FeedCopy.displayTitle(title) }
    /// "{M}월 {d}일의 주제". 상세 응답 전(시드)에는 nil.
    public private(set) var dateLabel: String?
    /// 화면에 그리는 좋아요 값(시드/응답/조율기 병합 결과). 로딩 중 nil.
    public private(set) var like: LikeState?
    /// 상세 응답을 받아 확정했는가.
    public private(set) var isConfirmed = false
    public private(set) var toast: Notice?
    public private(set) var edit: TitleEdit?
    public private(set) var deletePrompt: ConfirmationPrompt?
    public private(set) var isDeleting = false
    public private(set) var dismissal: Dismissal?
    public private(set) var needsLogin = false

    /// 상세 확정 전에는 좋아요를 누를 수 없다(D-04).
    public var isLikeEnabled: Bool { isConfirmed }
    /// 내 게시물인가(응답 전 = 진입 값, 후 = authorId 비교). 게스트·뷰어 변경 뒤에는 false.
    public var isMine: Bool {
        guard !viewer.isGuest, let userId = viewer.userId else { return false }
        if let detail { return detail.isMine(viewerUserId: userId) }
        guard userId.lowercased() == entryOwner else { return false }
        switch entry {
        case let .listItem(item): return item.isMine
        case .mine: return true
        }
    }
    /// 수정 버튼 노출: 내 게시물 + 상세의 `topic.topicDate`가 KST 오늘(시계로 매번 재평가, D-23).
    public var canEditTitle: Bool {
        detail?.canEditTitle(viewerUserId: viewer.userId, now: clock.now) ?? false
    }
    /// 삭제 버튼 노출: 내 게시물.
    public var canDelete: Bool { isMine }

    // MARK: 의존성

    private let entry: PostDetailEntry
    private let posts: any PostRepository
    private let likes: LikeCoordinator
    private let likeEvents: LikeEventBroadcaster
    private let ledger: PostChangeLedger
    private let viewer: any ViewerContext
    private let clock: any AppClock
    private let screenTracker: ScreenTracker?

    // MARK: 내부 상태(화면이 읽지 않는다)

    /// 상세 응답(확정 전에는 nil).
    private var detail: PostDetail?
    @ObservationIgnored private let entryOwner: String?
    @ObservationIgnored private let work = ActiveWork()
    @ObservationIgnored private var notices = NoticeSequence()
    @ObservationIgnored private var isVisible = false
    /// 제목 수정이 성공할 때마다 올라간다. 그 전에 보낸 상세 응답이 새 제목을 덮지 못하게 한다.
    @ObservationIgnored private var titleRevision = 0
    @ObservationIgnored private var isDeleted = false

    public init(
        entry: PostDetailEntry, posts: any PostRepository,
        likes: LikeCoordinator, likeEvents: LikeEventBroadcaster, ledger: PostChangeLedger,
        viewer: any ViewerContext, clock: any AppClock, screenTracker: ScreenTracker?
    ) {
        self.entry = entry
        self.posts = posts
        self.likes = likes
        self.likeEvents = likeEvents
        self.ledger = ledger
        self.viewer = viewer
        self.clock = clock
        self.screenTracker = screenTracker
        entryOwner = viewer.userId?.lowercased()
        switch entry {
        case let .listItem(item):
            postId = item.id
            state = .content
            imageURL = item.originalImageURL
            signatureURL = item.signatureOriginalImageURL
            title = item.title
            like = item.like
        case let .mine(id, thumbnailURL):
            postId = id
            state = .loading
            imageURL = thumbnailURL
        }
        likeEvents.subscribe(self)
    }

    // MARK: 생명주기

    /// 화면이 보일 때: 보임 표시 + `screen_view(feed)` + 상세 로드/재검증.
    /// 재검증 실패는 내용이 보이면 유지 + 토스트(없으면 `.failed`/`.notFound`). 404면 시드 게시물을 `ledger`에 `unavailable`로 알린다.
    public func onAppear() async {
        isVisible = true
        screenTracker?.screenAppeared(.feed)
        await work.run { [self] in await load() }
    }

    /// 화면이 사라질 때: 보임 해제, 진행 중 조회 취소(오류 아님). 삭제·저장 요청은 취소하지 않고 결과만 반영한다.
    public func onDisappear() {
        isVisible = false
        work.cancel()
    }

    private func load() async {
        if case .failed = state { state = .loading }
        let titleAtStart = titleRevision
        do {
            let revision = likes.beginRevalidation()
            let response = try await posts.detail(id: postId)
            guard !Task.isCancelled else { return }
            apply(response, since: revision, keepTitle: titleRevision != titleAtStart)
        } catch {
            guard !error.isCancellation, !Task.isCancelled else { return }
            handleLoadFailure(error)
        }
    }

    private func apply(_ response: PostDetail, since revision: LikeRevision, keepTitle: Bool) {
        var response = response
        if keepTitle { response.title = title }
        detail = response
        imageURL = response.originalImageURL
        signatureURL = response.signatureOriginalImageURL
        title = response.title
        dateLabel = FeedCopy.topicDateLabel(response.topic.topicDate)
        like = likes.merge(server: response.like, for: postId, since: revision)
        isConfirmed = true
        state = .content
    }

    private func handleLoadFailure(_ error: any Error) {
        let failure = error as? FeedFailure
        if failure == .unauthorized { needsLogin = true }
        if failure == .notFound {
            state = .notFound(notices.make(FeedCopy.postNotFound))
            ledger.record(.unavailable(postId: postId))
            return
        }
        let text = failure.flatMap { FeedCopy.message(for: $0, operation: .postDetail) }
            ?? (failure == .unauthorized ? FeedCopy.loginRequired : FeedCopy.postLoadError)
        if state == .loading {
            state = .failed(notices.make(text))
        } else if failure != .unauthorized {
            showToast(text)
        }
    }

    // MARK: 좋아요

    /// 확정 전에는 무시(API 0건). 확정 후에는 `likes.tap`에 현재 표시 값을 넘긴다.
    public func likeTapped() {
        guard isConfirmed, let like else { return }
        likes.tap(postId: postId, current: like)
    }

    // MARK: 제목 수정

    /// 수정 버튼: `canEditTitle`이고 확정된 경우에만 다이얼로그를 연다(현재 제목이 미리 채워진다).
    public func editTapped() {
        guard isConfirmed, canEditTitle, edit == nil else { return }
        edit = TitleEdit(text: title ?? "")
    }

    /// 입력은 `PostTitle.clampedInput`으로 막는다(10 code point).
    public func editTextChanged(_ text: String) {
        guard var current = edit, !current.isSaving else { return }
        current.text = PostTitle.clampedInput(text)
        current.error = nil
        edit = current
    }

    /// 취소: 요청 없이 닫는다(저장 중에는 무시).
    public func cancelEdit() {
        guard let current = edit, !current.isSaving else { return }
        edit = nil
    }

    /// 저장 중에는 중복 요청 없음. 성공: 다이얼로그 닫기 + 토스트 + 제목 반영 + `ledger.titleChanged`.
    /// 실패: 다이얼로그·입력 유지 + `edit.error`. 404: 닫고 `dismissal = .unavailable`. 수정 가능 조건이 사라졌으면(자정 경과) 요청하지 않는다.
    public func saveEdit() async {
        guard var current = edit, !current.isSaving else { return }
        guard canEditTitle else {
            edit = nil
            showToast(FeedCopy.editStateError)
            return
        }
        current.isSaving = true
        current.error = nil
        edit = current
        // 화면을 벗어나도 저장 요청은 끝까지 간다(결과만 반영).
        await Task { @MainActor [self] in await performSave(current.text) }.value
    }

    private func performSave(_ text: String) async {
        do {
            let result = try await posts.updateTitle(id: postId, rawTitle: text)
            titleRevision += 1
            title = result.title
            detail?.title = result.title
            edit = nil
            showToast(FeedCopy.editSuccess)
            ledger.record(.titleChanged(postId: postId, title: result.title))
        } catch {
            let failure = error as? FeedFailure
            if failure == .notFound {
                edit = nil
                dismissal = .unavailable
                ledger.record(.unavailable(postId: postId))
                return
            }
            if failure == .unauthorized { needsLogin = true }
            edit?.isSaving = false
            guard !error.isCancellation else { return }
            let text = failure.map { FeedCopy.message(for: $0, operation: .updateTitle) ?? FeedCopy.editOtherError } ?? FeedCopy.editOtherError
            edit?.error = notices.make(text)
        }
    }

    // MARK: 삭제

    /// 삭제 버튼: 내 게시물이고 확정된 경우에만 확인창(`deletePrompt`)을 연다. 남의 게시물은 아무 일도 없다.
    public func deleteTapped() {
        guard isConfirmed, isMine, !isDeleting, !isDeleted else { return }
        deletePrompt = ConfirmationPrompt(
            message: FeedDialogCopy.deleteBody, confirmTitle: FeedDialogCopy.deleteConfirm, cancelTitle: FeedDialogCopy.deleteCancel
        )
    }

    public func cancelDelete() {
        deletePrompt = nil
    }

    /// 확인창의 "삭제": 진행 중·완료 후에는 무시(DELETE 1회). 204: `ledger.deleted` + `dismissal = .deleted`.
    /// 실패: 화면에 머물고 토스트, 다시 시도 가능.
    public func confirmDelete() async {
        guard deletePrompt != nil, isMine, !isDeleting, !isDeleted else { return }
        deletePrompt = nil
        isDeleting = true
        await Task { @MainActor [self] in await performDelete() }.value
    }

    private func performDelete() async {
        defer { isDeleting = false }
        do {
            try await posts.delete(id: postId)
            isDeleted = true
            ledger.record(.deleted(postId: postId))
            dismissal = .deleted(toast: isVisible ? notices.make(FeedCopy.deleteSuccess) : nil)
        } catch {
            guard !error.isCancellation else { return }
            let failure = error as? FeedFailure
            if failure == .unauthorized { needsLogin = true }
            if failure == .notFound {
                // 이미 없는 게시물이다(REQ-FEED-030): 목록·캐시에서 빼고 화면을 닫는다.
                isDeleted = true
                ledger.record(.deleted(postId: postId))
                showToast(FeedCopy.postNotFound)
                dismissal = .unavailable
                return
            }
            showToast(failure.map { FeedCopy.message(for: $0, operation: .deletePost) ?? FeedCopy.deleteOtherError } ?? FeedCopy.deleteOtherError)
        }
    }

    // MARK: 소비

    public func dismissToast() {
        toast = nil
    }

    /// 앱이 `needsLogin`을 처리(로그인 화면으로 이동)한 뒤 비운다.
    public func consumeNeedsLogin() {
        needsLogin = false
    }

    /// 앱이 `dismissal`을 처리(이전 화면으로 이동)한 뒤 비운다.
    public func consumeDismissal() {
        dismissal = nil
    }

    /// 토스트는 화면이 보일 때만 담는다(D-20).
    private func showToast(_ message: String) {
        guard isVisible else { return }
        toast = notices.make(message)
    }
}

extension PostDetailViewModel: LikeEventSink {
    /// 이 게시물의 상태 변경은 `like`에 반영, 토스트는 화면이 보일 때만, 404(`postUnavailable`)는 `dismissal = .unavailable`, 재인증은 `needsLogin`.
    public func likeCoordinator(didEmit event: LikeEvent) {
        switch event {
        case let .stateChanged(id, state, _):
            if id == postId { like = state }
        case let .toast(notice):
            showToast(notice.message)
        case let .postUnavailable(id):
            guard id == postId else { return }
            dismissal = .unavailable
            ledger.record(.unavailable(postId: postId))
        case .reauthenticationRequired:
            needsLogin = true
        }
    }
}
