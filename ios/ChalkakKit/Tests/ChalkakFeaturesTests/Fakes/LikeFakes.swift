import Foundation
import Synchronization
import ChalkakData
@testable import ChalkakFeatures

let postA = UUID(uuidString: "22222222-2222-4222-8222-222222222201")!
let postB = UUID(uuidString: "22222222-2222-4222-8222-222222222202")!
let postC = UUID(uuidString: "22222222-2222-4222-8222-222222222203")!

struct StubViewer: ViewerContext {
    var userId: String?
    var isGuest: Bool { userId == nil }
}

/// 테스트가 바꿀 수 있는 뷰어(계정 전환 시나리오).
final class MutableViewer: ViewerContext, Sendable {
    private let id = Mutex<String?>(nil)
    init(userId: String?) { id.withLock { $0 = userId } }
    var userId: String? { id.withLock { $0 } }
    var isGuest: Bool { userId == nil }
    func set(_ userId: String?) { id.withLock { $0 = userId } }
}

/// 좋아요 저장소 Fake. 호출을 기록하고, 각 호출은 테스트가 `resolve`/`fail`로 풀어 줄 때까지 멈춘다(continuation 훅).
/// `autoResolve`가 켜지면 서버 상태 모델(`serverLiked`, `serverCount`)대로 즉시 응답한다.
actor FakeLikeRepository: LikeRepository {
    struct Call: Equatable, Sendable {
        let postId: UUID
        let liked: Bool
    }

    private(set) var calls: [Call] = []
    private var pending: [(call: Call, continuation: CheckedContinuation<LikeResult, any Error>)] = []
    private var callWaiters: [(id: Int, count: Int, continuation: CheckedContinuation<Void, Never>)] = []
    private var nextWaiterID = 0
    private var inFlight: [UUID: Int] = [:]
    private(set) var maxConcurrentPerPost = 0
    private(set) var maxConcurrentTotal = 0

    var autoResolve = false
    private var serverLiked: [UUID: Bool] = [:]
    private var serverCount: [UUID: Int] = [:]

    func setAutoResolve(_ value: Bool) { autoResolve = value }
    func setServer(postId: UUID, liked: Bool, count: Int) {
        serverLiked[postId] = liked
        serverCount[postId] = count
    }
    func serverState(_ postId: UUID) -> (liked: Bool, count: Int) { (serverLiked[postId] ?? false, serverCount[postId] ?? 0) }

    func setLike(postId: UUID, liked: Bool) async throws -> LikeResult {
        let call = Call(postId: postId, liked: liked)
        calls.append(call)
        inFlight[postId, default: 0] += 1
        maxConcurrentPerPost = max(maxConcurrentPerPost, inFlight[postId] ?? 0)
        maxConcurrentTotal = max(maxConcurrentTotal, inFlight.values.reduce(0, +))
        defer { inFlight[postId, default: 1] -= 1 }
        wakeCallWaiters()
        if autoResolve { return applyToServer(call) }
        return try await withCheckedThrowingContinuation { continuation in
            pending.append((call, continuation))
        }
    }

    /// n번째(0부터) 호출이 시작될 때까지 기다린다. `Task.yield` 반복 없이 continuation으로 깨운다.
    func waitForCallCount(_ count: Int) async {
        if calls.count >= count { return }
        nextWaiterID += 1
        let id = nextWaiterID
        // 테스트가 취소·시간 초과되면 대기자를 깨워 hang 대신 실패로 끝나게 한다.
        await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                if Task.isCancelled { continuation.resume() } else { callWaiters.append((id, count, continuation)) }
            }
        } onCancel: {
            Task { await self.cancelWaiter(id) }
        }
    }

    private func cancelWaiter(_ id: Int) {
        guard let index = callWaiters.firstIndex(where: { $0.id == id }) else { return }
        callWaiters.remove(at: index).continuation.resume()
    }

    var pendingCount: Int { pending.count }

    /// 가장 오래된 대기 호출에 서버 모델대로 성공 응답.
    func resolveNext() {
        guard !pending.isEmpty else { return }
        let entry = pending.removeFirst()
        entry.continuation.resume(returning: applyToServer(entry.call))
    }

    /// 가장 오래된 대기 호출에 지정 응답.
    func resolveNext(with result: LikeResult) {
        guard !pending.isEmpty else { return }
        pending.removeFirst().continuation.resume(returning: result)
    }

    func failNext(_ error: any Error) {
        guard !pending.isEmpty else { return }
        pending.removeFirst().continuation.resume(throwing: error)
    }

    private func applyToServer(_ call: Call) -> LikeResult {
        let was = serverLiked[call.postId] ?? false
        var count = serverCount[call.postId] ?? 0
        if call.liked && !was { count += 1 }
        if !call.liked && was { count = max(0, count - 1) }
        serverLiked[call.postId] = call.liked
        serverCount[call.postId] = count
        return LikeResult(postId: call.postId, likeCount: count, isLiked: call.liked)
    }

    private func wakeCallWaiters() {
        let ready = callWaiters.filter { calls.count >= $0.count }
        callWaiters.removeAll { calls.count >= $0.count }
        ready.forEach { $0.continuation.resume() }
    }
}

/// 이벤트를 모으는 sink.
@MainActor
final class RecordingSink: LikeEventSink {
    private(set) var events: [LikeEvent] = []
    func likeCoordinator(didEmit event: LikeEvent) { events.append(event) }

    var toasts: [Notice] { events.compactMap { if case let .toast(t) = $0 { t } else { nil } } }
    var toastTexts: [String] { toasts.map(\.message) }
    var removedPosts: [UUID] { events.compactMap { if case let .postUnavailable(id) = $0 { id } else { nil } } }
    var reauthCount: Int { events.filter { $0 == .reauthenticationRequired }.count }
    func states(for postId: UUID) -> [LikeState] {
        events.compactMap { if case let .stateChanged(id, state, _) = $0, id == postId { state } else { nil } }
    }
    func causes(for postId: UUID) -> [LikeEvent.Cause] {
        events.compactMap { if case let .stateChanged(id, _, cause) = $0, id == postId { cause } else { nil } }
    }
}

@MainActor
struct LikeHarness {
    let repository = FakeLikeRepository()
    let sink = RecordingSink()
    let viewer: MutableViewer
    let coordinator: LikeCoordinator

    init(userId: String? = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") {
        viewer = MutableViewer(userId: userId)
        coordinator = LikeCoordinator(repository: repository, viewer: viewer, sink: sink)
        sinkRetained = sink
    }
    private let sinkRetained: RecordingSink
}

let notLiked10 = LikeState(isLiked: false, likeCount: 10)
let liked11 = LikeState(isLiked: true, likeCount: 11)
