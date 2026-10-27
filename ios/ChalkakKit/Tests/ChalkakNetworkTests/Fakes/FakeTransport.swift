import Foundation
import Testing
import ChalkakNetwork

/// 열고 닫는 문. 응답을 일부러 늦춰 경쟁 상황을 만든다.
actor Gate {
    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []
    func wait() async {
        if isOpen { return }
        await withCheckedContinuation { waiters.append($0) }
    }
    func open() {
        isOpen = true
        waiters.forEach { $0.resume() }
        waiters.removeAll()
    }
}

/// 받은 요청을 기록하고, 스크립트(순서대로) 또는 핸들러(요청별)로 응답한다.
actor FakeTransport: HTTPTransport {
    enum Step: Sendable {
        case response(HTTPResponse)
        case fail(TransportError)
        case cancel
    }
    typealias Handler = @Sendable (TransportRequest, Int) async throws -> HTTPResponse

    private(set) var requests: [TransportRequest] = []
    private var script: [Step]
    private let handler: Handler?

    init(script: [Step]) {
        self.script = script
        self.handler = nil
    }
    init(handler: @escaping Handler) {
        self.script = []
        self.handler = handler
    }

    func send(_ request: TransportRequest) async throws -> HTTPResponse {
        let index = requests.count
        requests.append(request)
        if let handler { return try await handler(request, index) }
        guard !script.isEmpty else { throw TransportError.other("script exhausted") }
        switch script.removeFirst() {
        case .response(let r): return r
        case .fail(let e): throw e
        case .cancel: throw CancellationError()
        }
    }

    var count: Int { requests.count }
    func requests(endingWith suffix: String) -> [TransportRequest] { requests.filter { $0.url.path.hasSuffix(suffix) } }
}

/// 조건이 참이 될 때까지 양보(`Task.yield`)하며 기다린다. 실시간 sleep은 쓰지 않는다.
/// 상한(반복 횟수)을 넘기면 `Issue.record`로 실패시키고 돌아온다.
func waitUntil(
    _ description: String = "조건",
    sourceLocation: SourceLocation = #_sourceLocation,
    _ condition: @Sendable () async -> Bool
) async {
    for _ in 0..<waitUntilMaxYields {
        if await condition() { return }
        await Task.yield()
    }
    Issue.record("waitUntil 시간 초과: \(description)", sourceLocation: sourceLocation)
}

let waitUntilMaxYields = 200_000
