import Foundation
import ChalkakNetwork

/// 전시·피드·좋아요 API 호출 종류. 같은 HTTP 상태도 호출에 따라 뜻이 달라서(예: 403) 오류 매핑의 입력이 된다(D-02).
public enum FeedOperation: Sendable, Equatable, CaseIterable {
    case listPosts
    case topic
    case postDetail
    case updateTitle
    case deletePost
    case like
    case unlike
    /// `GET /posts/today`. 403은 정지 회원(D-08, `FeedFailure.banned`)이다.
    case todayPost
    /// `GET /posts/calendar`
    case calendar
    /// `GET /banners` (비로그인 호출이라 401도 갱신하지 않는다)
    case banners
    /// `GET /notifications/unread-status`
    case unreadStatus
    /// `GET /posts/{id}/ai-review`
    case aiReviewStatus
    /// `POST /posts/{id}/ai-review` (403은 정지 회원 D-08)
    case aiReviewRequest
}

/// 화면이 분기에 쓰는 도메인 오류. `message` 문자열로는 분기하지 않고 `status + FeedOperation`으로만 만든다(D-02).
public enum FeedFailure: Error, Sendable, Equatable {
    /// 404 (삭제·비공개·미승인 게시물, 주제 없음)
    case notFound
    /// 403: 정지 회원이 좋아요 등록·제목 수정·AI 피드백 요청을 시도함(D-08)
    case banned
    /// 403: 삭제 API. 남의 게시물(정지 회원도 삭제는 허용이라 정지 문구가 아니다)
    case notOwner
    /// 403: 그 밖의 호출
    case forbidden
    /// 400. 서버 `message`는 표시·로그용으로만 보존한다.
    case badRequest(message: String?)
    /// 401 (토큰 갱신 후에도 인증 실패 = 재인증 필요)
    case unauthorized
    /// 연결 실패·타임아웃
    case network
    /// 응답 계약 위반(필수 필드 누락, 타입 오류, 음수 likeCount, 모순된 좋아요 응답, postId 불일치)
    case invalidResponse
    /// 5xx 및 분류되지 않은 상태
    case server(status: Int)
    /// 클라이언트 검증: 제목이 10 code point를 넘음(요청을 보내지 않는다)
    case titleTooLong
}

public enum FeedFailureMapper {
    /// 순수 매핑. 상태와 호출 API만 본다(errorCode는 이 도메인에서 분기에 쓰지 않고, `message`는 400에서 표시용으로 보존만 한다).
    public static func failure(status: Int, message: String?, operation: FeedOperation) -> FeedFailure {
        switch status {
        case 400: .badRequest(message: message)
        case 401: .unauthorized
        case 403: forbidden(for: operation)
        case 404: .notFound
        default: .server(status: status)
        }
    }

    /// APIError → FeedFailure. 취소(`CancellationError`)와 설정 오류(`ConfigurationError`)는 그대로 돌려준다(D-20: 취소는 오류가 아니다).
    public static func map(_ error: any Error, operation: FeedOperation) -> any Error {
        guard let apiError = error as? APIError else { return error }
        switch apiError {
        case let .http(status, _, message): return failure(status: status, message: message, operation: operation)
        case .network: return FeedFailure.network
        case .invalidResponse: return FeedFailure.invalidResponse
        }
    }

    /// 같은 403이라도 호출에 따라 뜻이 다르다(D-08): 등록·제목 수정·AI 피드백 요청은 정지 회원(AI 조회는 정지 회원도 허용이라 일반 forbidden), 삭제는 남의 게시물.
    private static func forbidden(for operation: FeedOperation) -> FeedFailure {
        switch operation {
        case .like, .updateTitle, .todayPost, .aiReviewRequest: .banned
        case .deletePost: .notOwner
        case .listPosts, .topic, .postDetail, .unlike, .calendar, .banners, .unreadStatus, .aiReviewStatus: .forbidden
        }
    }
}
