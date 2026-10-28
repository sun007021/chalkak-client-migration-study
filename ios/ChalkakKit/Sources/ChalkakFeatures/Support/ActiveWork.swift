import Foundation

/// 화면 이탈 때 취소할 수 있는 진행 중 작업. ViewModel이 `async` 진입점을 유지하면서도 `cancel()`로 중단할 수 있게 한다.
/// 바깥 호출 Task가 취소돼도 안쪽 작업에 전파한다. 여러 작업이 동시에 진행될 수 있고(날짜 연타 등) `cancel()`은 모두 취소한다.
@MainActor
final class ActiveWork {
    private var tasks: [Int: Task<Void, Never>] = [:]
    private var nextID = 0

    func run(_ body: @escaping @MainActor () async -> Void) async {
        nextID += 1
        let id = nextID
        let work = Task { @MainActor in await body() }
        tasks[id] = work
        await withTaskCancellationHandler { await work.value } onCancel: { work.cancel() }
        tasks[id] = nil
    }

    func cancel() {
        for task in tasks.values { task.cancel() }
    }
}

extension Error {
    /// 사용자가 보는 오류가 아니라 취소로 취급할 오류(D-20): `CancellationError`, `URLError.cancelled`.
    var isCancellation: Bool {
        self is CancellationError || (self as? URLError)?.code == .cancelled
    }
}
