import Foundation
import Testing
import ChalkakData
import ChalkakNetwork

@Suite("FeedFailure 매핑(D-02)")
struct FeedFailureMapperTests {
    struct Case: Sendable, CustomTestStringConvertible {
        let operation: FeedOperation
        let status: Int
        let code: ErrorCode?
        let expected: FeedFailure
        var testDescription: String { "\(operation) \(status) \(code?.rawValue ?? "-") -> \(expected)" }
    }

    static let cases: [Case] = [
        // 404 / 401은 모든 호출에서 같다
        Case(operation: .postDetail, status: 404, code: .businessError, expected: .notFound),
        Case(operation: .updateTitle, status: 404, code: .businessError, expected: .notFound),
        Case(operation: .deletePost, status: 404, code: .businessError, expected: .notFound),
        Case(operation: .like, status: 404, code: .businessError, expected: .notFound),
        Case(operation: .unlike, status: 404, code: .businessError, expected: .notFound),
        Case(operation: .listPosts, status: 404, code: .businessError, expected: .notFound),
        Case(operation: .topic, status: 404, code: .businessError, expected: .notFound),
        Case(operation: .postDetail, status: 401, code: .unauthorized, expected: .unauthorized),
        Case(operation: .like, status: 401, code: .reauthenticationRequired, expected: .unauthorized),
        Case(operation: .deletePost, status: 401, code: .reauthenticationRequired, expected: .unauthorized),
        // 403은 호출 API로 구분한다(D-02, D-08)
        Case(operation: .like, status: 403, code: .forbidden, expected: .banned),
        Case(operation: .updateTitle, status: 403, code: .forbidden, expected: .banned),
        Case(operation: .deletePost, status: 403, code: .forbidden, expected: .notOwner),
        Case(operation: .unlike, status: 403, code: .forbidden, expected: .forbidden),
        Case(operation: .postDetail, status: 403, code: .forbidden, expected: .forbidden),
        // 400은 message를 보존하되 분기에는 쓰지 않는다
        Case(operation: .updateTitle, status: 400, code: .businessError, expected: .badRequest(message: "m")),
        Case(operation: .deletePost, status: 400, code: .businessError, expected: .badRequest(message: "m")),
        Case(operation: .listPosts, status: 400, code: .businessError, expected: .badRequest(message: "m")),
        Case(operation: .postDetail, status: 400, code: .businessError, expected: .badRequest(message: "m")),
        // 5xx와 기타
        Case(operation: .like, status: 500, code: .internalError, expected: .server(status: 500)),
        Case(operation: .postDetail, status: 503, code: nil, expected: .server(status: 503)),
        Case(operation: .listPosts, status: 502, code: nil, expected: .server(status: 502)),
        Case(operation: .updateTitle, status: 429, code: nil, expected: .server(status: 429)),
    ]

    @Test("TC-FEED-007 TC-FEED-029 TC-FEED-040 TC-LIKE-010 TC-LIKE-011 상태·errorCode·호출 API로 도메인 오류를 고른다", arguments: cases)
    func mapsByStatusCodeAndOperation(testCase: Case) {
        let failure = FeedFailureMapper.failure(status: testCase.status, message: "m", operation: testCase.operation)
        #expect(failure == testCase.expected)
    }

    @Test("TC-FEED-008 D-02 message 문자열을 바꿔도 분류는 같다(message 분기 금지)")
    func messageDoesNotAffectClassification() {
        for operation in FeedOperation.allCases {
            let a = FeedFailureMapper.failure(status: 404, message: "게시물을 찾을 수 없습니다.", operation: operation)
            let b = FeedFailureMapper.failure(status: 404, message: "전혀 다른 문구", operation: operation)
            let c = FeedFailureMapper.failure(status: 404, message: nil, operation: operation)
            #expect(a == .notFound && b == .notFound && c == .notFound)
        }
    }

    @Test("D-02 APIError.http는 FeedFailure로 바뀐다")
    func mapsAPIErrorHTTP() {
        let error = APIError.http(status: 403, code: .forbidden, message: "차단된 회원입니다.")
        #expect(FeedFailureMapper.map(error, operation: .like) as? FeedFailure == .banned)
        #expect(FeedFailureMapper.map(error, operation: .deletePost) as? FeedFailure == .notOwner)
    }

    @Test("TC-FEED-008 연결 실패(APIError.network)와 응답 오류(.invalidResponse)")
    func mapsNetworkAndInvalid() {
        #expect(FeedFailureMapper.map(APIError.network, operation: .postDetail) as? FeedFailure == .network)
        #expect(FeedFailureMapper.map(APIError.invalidResponse, operation: .postDetail) as? FeedFailure == .invalidResponse)
    }

    @Test("TC-DISP-048 D-20 취소와 설정 오류는 FeedFailure로 바꾸지 않는다")
    func passesThroughCancellationAndConfiguration() {
        #expect(FeedFailureMapper.map(CancellationError(), operation: .listPosts) is CancellationError)
        let configuration = ConfigurationError.invalidBaseURL
        #expect(FeedFailureMapper.map(configuration, operation: .listPosts) as? ConfigurationError == configuration)
    }
}
