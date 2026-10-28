import Foundation

/// 문자열화(`print`, `\(…)`, `String(reflecting:)`, 테스트 실패 출력)에 비밀값이 새지 않게 한다.
/// 토큰·nonce를 들고 있는 값 타입에 붙이면 값 대신 `Type(<redacted>)`만 보인다.
public protocol RedactedDescription: CustomStringConvertible, CustomDebugStringConvertible {}

extension RedactedDescription {
    public var description: String { "\(Self.self)(<redacted>)" }
    public var debugDescription: String { description }
}
