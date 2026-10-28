import Foundation
import Testing
import ChalkakData
import ChalkakNetwork

@Suite("AIR 오류 매핑(D-02)")
struct AIReviewFailureMappingTests {
    struct Case: Sendable, CustomTestStringConvertible {
        let operation: FeedOperation
        let status: Int
        let message: String?
        let expected: FeedFailure
        var testDescription: String { "\(operation) \(status) -> \(expected)" }
    }

    static let cases: [Case] = [
        Case(operation: .aiReviewStatus, status: 404, message: "게시물을 찾을 수 없습니다.", expected: .notFound),
        Case(operation: .aiReviewRequest, status: 404, message: "게시물을 찾을 수 없습니다.", expected: .notFound),
        // 403은 호출 API로 구분한다: 요청은 정지 회원(D-08), 조회는 정지 회원도 허용이라 일반 forbidden
        Case(operation: .aiReviewRequest, status: 403, message: "차단된 회원입니다.", expected: .banned),
        Case(operation: .aiReviewStatus, status: 403, message: nil, expected: .forbidden),
        // 400은 서버 message를 보존한다(그대로 보여 준다, REQ-AIR-035)
        Case(operation: .aiReviewRequest, status: 400, message: "더 이상 AI 리뷰를 다시 요청할 수 없습니다.", expected: .badRequest(message: "더 이상 AI 리뷰를 다시 요청할 수 없습니다.")),
        Case(operation: .aiReviewRequest, status: 400, message: "지금은 AI 리뷰를 요청할 수 없습니다.", expected: .badRequest(message: "지금은 AI 리뷰를 요청할 수 없습니다.")),
        Case(operation: .aiReviewStatus, status: 401, message: nil, expected: .unauthorized),
        Case(operation: .aiReviewRequest, status: 401, message: nil, expected: .unauthorized),
        Case(operation: .aiReviewRequest, status: 500, message: nil, expected: .server(status: 500)),
        Case(operation: .aiReviewStatus, status: 503, message: nil, expected: .server(status: 503)),
        Case(operation: .aiReviewRequest, status: 409, message: nil, expected: .server(status: 409)),
    ]

    @Test("TC-AIR-009 TC-AIR-026 TC-AIR-027 TC-AIR-028 TC-AIR-029 TC-AIR-031 상태·호출 API로 도메인 오류를 고른다", arguments: cases)
    func mapsByStatusAndOperation(testCase: Case) {
        let failure = FeedFailureMapper.failure(status: testCase.status, message: testCase.message, operation: testCase.operation)
        #expect(failure == testCase.expected)
    }

    @Test("TC-AIR-009 연결 실패는 network, 응답 계약 위반은 invalidResponse, 취소는 그대로 전파한다")
    func mapsTransportErrors() {
        for operation in [FeedOperation.aiReviewStatus, .aiReviewRequest] {
            #expect(FeedFailureMapper.map(APIError.network, operation: operation) as? FeedFailure == .network)
            #expect(FeedFailureMapper.map(APIError.invalidResponse, operation: operation) as? FeedFailure == .invalidResponse)
            #expect(FeedFailureMapper.map(CancellationError(), operation: operation) is CancellationError)
        }
    }
}
