import Foundation

/// 열릴 때까지 `wait()`가 멈추는 문. 기다리는 중 취소되면 `CancellationError`로 끝난다(취소에 협조하는 비동기 작업을 흉내).
public actor CancellableGate {
    private var isOpen = false
    private var waiters: [UUID: CheckedContinuation<Void, any Error>] = [:]

    public init() {}

    public func wait() async throws {
        if isOpen { return }
        let id = UUID()
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, any Error>) in
                if Task.isCancelled {
                    continuation.resume(throwing: CancellationError())
                } else {
                    waiters[id] = continuation
                }
            }
        } onCancel: {
            Task { await self.cancelWaiter(id) }
        }
    }

    private func cancelWaiter(_ id: UUID) {
        waiters.removeValue(forKey: id)?.resume(throwing: CancellationError())
    }

    public func open() {
        isOpen = true
        let all = waiters.values
        waiters.removeAll()
        all.forEach { $0.resume() }
    }
}

/// 열릴 때까지 `wait()`가 멈추되 취소를 무시하는 문(취소에 협조하지 않는 늦은 응답을 흉내).
public actor StubbornGate {
    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    public init() {}

    public func wait() async {
        if isOpen { return }
        await withCheckedContinuation { waiters.append($0) }
    }

    public func open() {
        isOpen = true
        let all = waiters
        waiters.removeAll()
        all.forEach { $0.resume() }
    }
}

/// "불렸다"를 세고 기다리는 쪽을 깨운다. Fake가 호출 진입 때 `fire()`하고, 테스트는 `wait(atLeast:)`로 실시간·양보 횟수에 기대지 않고 기다린다.
/// 기다리는 중 취소(테스트 시간 초과 등)되면 깨어나므로, 일어나지 않을 이벤트를 기다려도 멈춰 있지 않고 이어지는 단언이 실패로 끝난다.
public actor CallSignal {
    public private(set) var count = 0
    private var waiters: [(id: Int, target: Int, continuation: CheckedContinuation<Void, Never>)] = []
    private var nextID = 0

    public init() {}

    public func fire() {
        count += 1
        let ready = waiters.filter { $0.target <= count }
        waiters.removeAll { $0.target <= count }
        ready.forEach { $0.continuation.resume() }
    }

    public func wait(atLeast target: Int = 1) async {
        if count >= target { return }
        nextID += 1
        let id = nextID
        await withTaskCancellationHandler {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                if Task.isCancelled { continuation.resume() } else { waiters.append((id, target, continuation)) }
            }
        } onCancel: {
            Task { await self.cancelWaiter(id) }
        }
    }

    private func cancelWaiter(_ id: Int) {
        guard let index = waiters.firstIndex(where: { $0.id == id }) else { return }
        waiters.remove(at: index).continuation.resume()
    }
}
