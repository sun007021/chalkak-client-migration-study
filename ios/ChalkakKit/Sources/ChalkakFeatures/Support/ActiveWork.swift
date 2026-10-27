import Foundation

/// 화면 이탈 때 취소할 수 있는 진행 중 작업 한 건. ViewModel이 `async` 진입점을 유지하면서도 `cancel()`로 중단할 수 있게 한다.
/// 바깥 호출 Task가 취소돼도 안쪽 작업에 전파한다.
@MainActor
final class ActiveWork {
    private var task: Task<Void, Never>?

    func run(_ body: @escaping @MainActor () async -> Void) async {
        let work = Task { @MainActor in await body() }
        task = work
        await withTaskCancellationHandler { await work.value } onCancel: { work.cancel() }
        // 그 사이 새 작업이 시작됐다면 지우지 않는다.
        if task == work { task = nil }
    }

    func cancel() { task?.cancel() }
}

extension Error {
    /// 사용자가 보는 오류가 아니라 취소로 취급할 오류(D-20): `CancellationError`, `URLError.cancelled`.
    var isCancellation: Bool {
        self is CancellationError || (self as? URLError)?.code == .cancelled
    }
}
