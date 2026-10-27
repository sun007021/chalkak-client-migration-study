import Foundation

public struct RequestToken: Sendable, Equatable {
    fileprivate let generation: Int
}

/// 느린 응답이 새 응답을 덮어쓰거나, 계정 전환 뒤 이전 계정 응답이 반영되는 것을 막는 가드.
public struct RequestGeneration: Sendable, Equatable {
    private var current = 0
    public init() {}
    /// 새 요청을 시작한다. 이전 토큰은 무효가 된다.
    public mutating func begin() -> RequestToken {
        current += 1
        return RequestToken(generation: current)
    }
    /// 계정 전환·로그아웃. 진행 중인 모든 토큰이 무효가 된다.
    public mutating func invalidateAll() { current += 1 }
    public func isCurrent(_ token: RequestToken) -> Bool { token.generation == current }
}
