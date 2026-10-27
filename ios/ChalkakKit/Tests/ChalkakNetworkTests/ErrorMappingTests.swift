import Foundation
import Testing
@testable import ChalkakNetwork

@Suite("NET 오류 매핑")
struct ErrorMappingTests {
    private func parse(_ status: Int, _ body: String) -> APIError {
        ErrorResponseParser.parse(status: status, body: Data(body.utf8))
    }

    @Test("TC-NET-001 오류 바디를 status·errorCode·message로 변환한다")
    func businessError() {
        let e = parse(400, #"{"errorCode":"BUSINESS_ERROR","message":"이미 처리된 요청입니다."}"#)
        #expect(e == .http(status: 400, code: .businessError, message: "이미 처리된 요청입니다."))
    }

    @Test("TC-NET-001 알려진 모든 errorCode 문자열이 대응 코드로 변환된다", arguments: ErrorCode.allCases)
    func knownCodes(code: ErrorCode) {
        let e = parse(400, #"{"errorCode":"\#(code.rawValue)","message":"m"}"#)
        #expect(e == .http(status: 400, code: code, message: "m"))
    }

    @Test("TC-NET-002 알 수 없는 errorCode는 BUSINESS_ERROR로 취급한다")
    func unknownCode() {
        #expect(parse(400, #"{"errorCode":"SOMETHING_NEW","message":"m"}"#) == .http(status: 400, code: .businessError, message: "m"))
        #expect(ErrorCode.from(serverValue: "SOMETHING_NEW") == .businessError)
    }

    @Test("TC-NET-003 사용자 API에 없는 코드는 BUSINESS_ERROR와 같게 처리한다", arguments: ["RESOURCE_STATE_CHANGED", "USER_METRICS_AGGREGATION_IN_PROGRESS"])
    func serverOnlyCodes(raw: String) {
        #expect(ErrorCode.from(serverValue: raw) == .businessError)
        #expect(parse(400, #"{"errorCode":"\#(raw)","message":"m"}"#) == .http(status: 400, code: .businessError, message: "m"))
    }

    @Test("TC-NET-004 errorCode 없는 본문은 status만 보존한다", arguments: [
        (502, "<html><body>Bad Gateway</body></html>"),
        (500, ""),
        (503, "not json at all"),
        (400, #"{"message":"코드 없음"}"#),
        (500, "[]"),
    ])
    func noErrorCode(status: Int, body: String) {
        guard case let .http(s, code, _) = parse(status, body) else {
            Issue.record("APIError.http가 아님")
            return
        }
        #expect(s == status)
        #expect(code == nil)
    }

    @Test("TC-NET-033 필터 단계 403 문구도 FORBIDDEN으로 안전하게 파싱된다")
    func filterForbidden() {
        #expect(parse(403, #"{"errorCode":"FORBIDDEN","message":"접근 권한이 없습니다."}"#) == .http(status: 403, code: .forbidden, message: "접근 권한이 없습니다."))
    }

    @Test("TC-NET-034 404 BUSINESS_ERROR는 코드·상태를 그대로 보존한다")
    func notFoundApi() {
        #expect(parse(404, #"{"errorCode":"BUSINESS_ERROR","message":"요청한 API를 찾을 수 없습니다."}"#) == .http(status: 404, code: .businessError, message: "요청한 API를 찾을 수 없습니다."))
    }

    @Test("TC-NET-035 검증 오류 message는 보존하되 분기에 쓰이지 않는다(코드·상태만으로 분류 가능)")
    func validationMessageKept() {
        let e = parse(400, #"{"errorCode":"BUSINESS_ERROR","message":"date: 요청 값의 형식이 올바르지 않습니다."}"#)
        #expect(e == .http(status: 400, code: .businessError, message: "date: 요청 값의 형식이 올바르지 않습니다."))
    }

    @Test("TC-NET-036 500 INTERNAL_ERROR는 http(500, internalError)로 전달된다(비멱등이라 재시도 없음)")
    func internalError() async throws {
        let sut = try SUT(script: [.response(.error(500, "INTERNAL_ERROR", "서버에서 요청을 처리하지 못했습니다."))])
        await #expect(throws: APIError.http(status: 500, code: .internalError, message: "서버에서 요청을 처리하지 못했습니다.")) {
            try await sut.client.send(HTTPRequest(method: .post, path: "/feedbacks"))
        }
    }

    @Test("TC-NET-032 403 FORBIDDEN은 재전송하지 않고 세션도 건드리지 않는다")
    func forbiddenNoRetry() async throws {
        let sut = try SUT(script: [.response(.error(403, "FORBIDDEN", "차단된 회원입니다."))])
        await #expect(throws: APIError.http(status: 403, code: .forbidden, message: "차단된 회원입니다.")) {
            try await sut.client.send(get("/posts/today", retry: .idempotent))
        }
        #expect(await sut.transport.count == 1)
        #expect(await sut.store.clearCount == 0)
        #expect(await sut.store.currentSession() != nil)
        #expect(sut.clock.recordedSleeps.isEmpty)
    }
}
