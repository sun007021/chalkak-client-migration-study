import Foundation

/// 응답 검증과 디코딩. 오류 매핑은 `ErrorResponseParser`가 맡는다.
enum ResponseDecoding {
    static func isSuccess(_ response: HTTPResponse) -> Bool { (200..<300).contains(response.status) }

    static func failure(for response: HTTPResponse) -> APIError {
        ErrorResponseParser.parse(status: response.status, body: response.body)
    }

    static func decode<T: Decodable>(_ type: T.Type, from response: HTTPResponse) throws -> T {
        guard isJSON(response), !response.body.isEmpty else { throw APIError.invalidResponse }
        do {
            return try APIJSON.makeDecoder().decode(type, from: response.body)
        } catch {
            throw APIError.invalidResponse
        }
    }

    private static func isJSON(_ response: HTTPResponse) -> Bool {
        guard let header = response.header("Content-Type") else { return false }
        let mediaType = header.split(separator: ";").first.map { $0.trimmingCharacters(in: .whitespaces).lowercased() } ?? ""
        return mediaType == "application/json" || mediaType.hasSuffix("+json")
    }
}
