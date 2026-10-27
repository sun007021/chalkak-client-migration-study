import Foundation

public extension UUID {
    /// 서버는 소문자 정규형만 받는다. `uuidString`은 대문자라 쓰지 않는다.
    var apiString: String { uuidString.lowercased() }
}

/// 요청 바디에 실리는 UUID. 인코딩하면 소문자 문자열이고, 디코딩은 대소문자를 가리지 않는다.
/// 바디의 UUID 필드는 이 래퍼(또는 `apiString`을 담은 String)로 선언한다. JSON 후처리는 하지 않는다.
public struct APIUUID: Sendable, Hashable, Codable {
    public let value: UUID
    public init(_ value: UUID) { self.value = value }

    public init(from decoder: any Decoder) throws {
        let text = try decoder.singleValueContainer().decode(String.self)
        guard let uuid = UUID(uuidString: text) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "UUID 형식이 아닙니다."))
        }
        value = uuid
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(value.apiString)
    }
}

public enum APIJSON {
    public static func makeEncoder() -> APIEncoder { APIEncoder() }
    public static func makeDecoder() -> JSONDecoder { JSONDecoder() }
}

/// 요청 바디 인코더(값 타입이라 Sendable). 문자열 내용은 가공하지 않는다.
public struct APIEncoder: Sendable {
    public init() {}
    public func encode<T: Encodable>(_ value: T) throws -> Data {
        try JSONEncoder().encode(value)
    }
}
