import Foundation
import ChalkakCore
import ChalkakData

/// `LikeCoordinator`가 화면에 알리는 일.
public enum LikeEvent: Sendable, Equatable {
    public enum Cause: Sendable, Equatable {
        /// 탭 직후 낙관적 반영
        case optimistic
        /// 서버 응답으로 덮어씀(마지막 의도와 일치)
        case confirmed
        /// 실패로 되돌림
        case rolledBack
    }

    case stateChanged(postId: UUID, state: LikeState, cause: Cause)
    case toast(Notice)
    /// 404: 삭제·비공개 게시물. 목록·캐시에서 빼고(상세면 닫고 목록 갱신) 하라는 신호.
    case postUnavailable(postId: UUID)
    /// 토큰 갱신 후에도 401: 롤백했고 로그인 화면으로 보내야 한다. 토스트는 없다.
    case reauthenticationRequired
}

@MainActor
public protocol LikeEventSink: AnyObject {
    func likeCoordinator(didEmit event: LikeEvent)
}

/// 재검증(목록·상세) 요청을 보낼 때 받아 두는 표식. 응답을 합칠 때 "요청 이후에 끝난 좋아요 변경"을 가려내는 데 쓴다.
public struct LikeRevision: Sendable, Equatable {
    public let value: Int
    public init(value: Int) { self.value = value }
}

public enum LikeTapResult: Sendable, Equatable {
    /// 낙관 반영하고 요청을 시작했거나 진행 중 요청의 의도만 바꿨다.
    case accepted
    /// 게스트: API 0건, 토스트만(D-05).
    case guestBlocked
}

/// 전 화면 공통 좋아요 조율기(D-04). 게시물마다 낙관적 갱신, 진행 중 연타는 마지막 의도만 남겨 직렬화,
/// 응답으로 덮어쓰기, 실패 롤백, 늦은 재검증 응답 병합을 맡는다. 화면 ViewModel은 하트 탭을 `tap`으로 넘기고
/// 목록·상세 응답은 `merge`로 거쳐 그린다. 네트워크 재시도(D-21)는 APIClient가 하므로 여기서 다시 하지 않는다.
@MainActor
public final class LikeCoordinator {
    public weak var sink: (any LikeEventSink)?

    private struct Entry {
        /// 화면에 그리는 값(낙관 반영 포함).
        var display: LikeState
        /// 서버가 확인한 마지막 값. 실패하면 여기로 되돌린다.
        var confirmed: LikeState
        /// 사용자가 마지막으로 원한 상태.
        var intent: Bool
        /// 이 게시물이 마지막으로 바뀐 시점의 `revision`.
        var lastChange: Int
        /// 진행 중인 요청 작업(없으면 대기 중인 요청 없음).
        var worker: Task<Void, Never>?
        var workerID = 0
    }

    private let repository: any LikeRepository
    private let viewer: any ViewerContext
    private var entries: [UUID: Entry] = [:]
    /// reset으로 버려졌지만 아직 끝나지 않은 작업(`settledAll`이 기다린다). 끝나면 스스로 빠진다.
    private var retired: [Int: Task<Void, Never>] = [:]
    /// 변경(탭·응답) 때마다 올라가는 카운터. 재검증 요청 시점과 비교한다.
    private var revision = 0
    /// reset마다 올라간다. 이전 세대의 늦은 응답을 알아보는 데 쓴다.
    private var epoch = 0
    private var owner: String?
    private var notices = NoticeSequence()
    private var nextWorkerID = 0

    public init(repository: any LikeRepository, viewer: any ViewerContext, sink: (any LikeEventSink)? = nil) {
        self.repository = repository
        self.viewer = viewer
        self.sink = sink
        owner = Self.normalize(viewer.userId)
    }

    /// 지금 화면에 그려야 할 좋아요 상태(모르면 nil).
    public func state(for postId: UUID) -> LikeState? {
        syncOwner()
        return entries[postId]?.display
    }

    /// 하트 탭. `current`는 탭한 카드가 보여 주던 값으로, 이 게시물을 처음 다룰 때의 기준(롤백 지점)이 된다.
    @discardableResult
    public func tap(postId: UUID, current: LikeState) -> LikeTapResult {
        syncOwner()
        if viewer.isGuest {
            emitToast(FeedCopy.guestLike)
            return .guestBlocked
        }
        revision += 1
        var entry = entries[postId] ?? Entry(display: current, confirmed: current, intent: current.isLiked, lastChange: revision)
        // 어느 화면에서 눌러도 조율기가 가진 값이 기준이다(단일 상태).
        let liked = !entry.display.isLiked
        let count = liked ? entry.display.likeCount + 1 : max(0, entry.display.likeCount - 1)
        entry.display = LikeState(isLiked: liked, likeCount: count)
        entry.intent = liked
        entry.lastChange = revision
        if entry.worker == nil {
            let generation = epoch
            nextWorkerID += 1
            let workerID = nextWorkerID
            entry.workerID = workerID
            entry.worker = Task { [weak self] in await self?.run(postId: postId, epoch: generation, workerID: workerID) }
        }
        entries[postId] = entry
        sink?.likeCoordinator(didEmit: .stateChanged(postId: postId, state: entry.display, cause: .optimistic))
        return .accepted
    }

    /// 목록·상세 요청을 보내기 직전에 호출해 표식을 받아 둔다.
    public func beginRevalidation() -> LikeRevision { LikeRevision(value: revision) }

    /// 재검증 응답의 서버 값을 합친다. 요청 이후에 좋아요가 바뀌었거나 진행 중이면 로컬 값을 유지하고 아니면 서버 값을 채택한다.
    /// 화면에는 돌려준 값을 그린다.
    public func merge(server: LikeState, for postId: UUID, since revision: LikeRevision) -> LikeState {
        syncOwner()
        if let entry = entries[postId], entry.worker != nil || entry.lastChange > revision.value {
            return entry.display
        }
        // 새로 만든 entry는 사용자 변경이 없으므로 lastChange 0이다(더 오래된 표식의 재검증 응답도 채택할 수 있다).
        var entry = entries[postId] ?? Entry(display: server, confirmed: server, intent: server.isLiked, lastChange: 0)
        entry.display = server
        entry.confirmed = server
        entry.intent = server.isLiked
        entries[postId] = entry
        return server
    }

    /// 로그아웃·계정 전환: 진행 중 작업을 취소하고 모든 상태를 비운다. 이전 계정의 늦은 응답은 무시된다.
    public func reset() {
        for entry in entries.values {
            if let worker = entry.worker {
                worker.cancel()
                retired[entry.workerID] = worker
            }
        }
        entries.removeAll()
        epoch += 1
        owner = Self.normalize(viewer.userId)
    }

    /// 한 게시물의 진행 중 작업이 끝날 때까지 기다린다(테스트용). 실시간 대기 없음.
    func settled(postId: UUID) async {
        await entries[postId]?.worker?.value
    }

    /// 모든 게시물의 진행 중 작업이 끝날 때까지 기다린다.
    func settledAll() async {
        let workers = entries.values.compactMap(\.worker) + retired.values
        for worker in workers { await worker.value }
    }

    // MARK: 요청 처리

    private func run(postId: UUID, epoch generation: Int, workerID: Int) async {
        await drain(postId: postId, epoch: generation)
        retired[workerID] = nil
    }

    /// 게시물 하나의 요청 루프. 응답을 받았을 때 마지막 의도와 다르면 한 번 더 보낸다(동시 요청은 항상 1개 이하).
    private func drain(postId: UUID, epoch generation: Int) async {
        while isCurrent(generation), let wanted = entries[postId]?.intent {
            do {
                let result = try await repository.setLike(postId: postId, liked: wanted)
                guard isCurrent(generation) else { return }
                revision += 1
                entries[postId]?.confirmed = result.state
                entries[postId]?.lastChange = revision
                if entries[postId]?.intent == result.isLiked {
                    entries[postId]?.display = result.state
                    entries[postId]?.worker = nil
                    sink?.likeCoordinator(didEmit: .stateChanged(postId: postId, state: result.state, cause: .confirmed))
                    return
                }
            } catch {
                guard isCurrent(generation) else { return }
                rollBack(postId: postId, wanted: wanted, error: error)
                return
            }
        }
    }

    private func rollBack(postId: UUID, wanted: Bool, error: any Error) {
        guard let confirmed = entries[postId]?.confirmed else { return }
        revision += 1
        entries[postId]?.display = confirmed
        entries[postId]?.intent = confirmed.isLiked
        entries[postId]?.lastChange = revision
        entries[postId]?.worker = nil
        sink?.likeCoordinator(didEmit: .stateChanged(postId: postId, state: confirmed, cause: .rolledBack))
        // 취소(화면 이탈 등)는 오류가 아니다(D-20). 조용히 되돌리기만 한다.
        if error is CancellationError { return }
        let failure = error as? FeedFailure
        switch failure {
        case .some(.unauthorized):
            sink?.likeCoordinator(didEmit: .reauthenticationRequired)
        case .some(.notFound):
            sink?.likeCoordinator(didEmit: .postUnavailable(postId: postId))
            emitToast(FeedCopy.likeGeneric)
        default:
            let operation: FeedOperation = wanted ? .like : .unlike
            emitToast(failure.flatMap { FeedCopy.message(for: $0, operation: operation) } ?? FeedCopy.likeGeneric)
        }
    }

    private func emitToast(_ text: String) {
        sink?.likeCoordinator(didEmit: .toast(notices.make(text)))
    }

    // MARK: 계정·세대

    /// 응답이 아직 유효한가. 뷰어가 바뀌었으면 reset을 거쳐 이전 계정의 작업을 버린다.
    private func isCurrent(_ generation: Int) -> Bool {
        syncOwner()
        return generation == epoch
    }

    /// `reset()` 호출 없이 뷰어가 바뀐 경우(계정 전환)에도 이전 계정의 상태가 남지 않게 한다.
    private func syncOwner() {
        if Self.normalize(viewer.userId) != owner { reset() }
    }

    private static func normalize(_ userId: String?) -> String? { userId?.lowercased() }
}
