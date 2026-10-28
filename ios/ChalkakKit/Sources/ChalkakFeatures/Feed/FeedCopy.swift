import Foundation
import ChalkakCore
import ChalkakData

/// 전시·피드·좋아요 문구. 값은 `shared/copy/ko.json`과 같아야 한다(`SharedCopy` 대조 테스트).
public enum FeedCopy {
    // 좋아요
    public static let likeGeneric = "좋아요를 반영하지 못했어요"
    public static let likeBanned = "이용이 제한되어 좋아요를 누를 수 없어요."
    public static let guestLike = "좋아요를 누르려면 로그인이 필요해요"
    public static let guestFeed = "게시물 피드를 보려면 로그인이 필요해요"
    // 공통
    public static let networkError = "네트워크 연결을 확인해 주세요."
    public static let loginRequired = "로그인이 필요해요"
    // 전시
    public static let displayError = "전시를 불러오지 못했어요"
    public static let dateMissing = "해당 날짜의 전시가 없어요"
    public static let displayEmpty = "이 날 올라온 사진이 없어요"
    // 상세
    public static let untitled = "무제"
    public static let postNotFound = "게시물을 찾을 수 없어요"
    public static let postLoadError = "게시물을 불러오지 못했어요"
    public static let postInvalid = "게시물 정보를 불러오지 못했어요"
    // 제목 수정
    public static let editStateError = "수정할 수 없는 상태이거나 주제 참여 기간이 끝났어요"
    public static let editBanned = "이용이 제한되어 제목을 수정할 수 없어요."
    public static let editForbidden = "본인의 게시물만 수정할 수 있어요"
    public static let editOtherError = "게시물 제목을 수정하지 못했어요"
    public static let editTitleTooLong = "제목은 10자 이하여야 합니다."
    public static let editSuccess = "제목을 수정했어요"
    // 삭제
    public static let deleteStateError = "삭제할 수 없는 상태의 게시물이에요"
    public static let deleteForbidden = "본인이 작성한 게시물만 삭제할 수 있어요"
    public static let deleteOtherError = "게시물을 삭제하지 못했어요"
    public static let deleteSuccess = "게시물을 삭제했어요"

    /// 호출별 오류 토스트/안내 문구. nil이면 문구를 띄우지 않는다(401은 로그인 화면 이동으로 처리, 좋아요 401은 조용히).
    /// 분기는 failure와 operation으로만 하고 서버 message는 쓰지 않는다(D-02).
    public static func message(for failure: FeedFailure, operation: FeedOperation) -> String? {
        switch operation {
        case .updateTitle: updateTitleMessage(failure)
        case .deletePost: deleteMessage(failure)
        case .postDetail: detailMessage(failure)
        case .like, .unlike: failure == .banned ? likeBanned : (failure == .unauthorized ? nil : likeGeneric)
        case .listPosts, .topic: listMessage(failure)
        }
    }

    /// 404는 그 날짜에 전시(주제)가 없다는 뜻이다. Empty 화면으로 그릴지 토스트로 띄울지는 ViewModel이 정한다.
    private static func listMessage(_ failure: FeedFailure) -> String? {
        switch failure {
        case .notFound: dateMissing
        case .unauthorized: nil
        case .network: networkError
        default: displayError
        }
    }

    // 아래 매핑에는 `FeedFailureMapper`가 해당 호출에서 만들지 않는 case(예: 삭제의 banned)도 포함한다. switch를 빠짐없이 두려는 안전망이다.
    private static func updateTitleMessage(_ failure: FeedFailure) -> String {
        switch failure {
        case .badRequest: editStateError
        case .banned: editBanned
        case .forbidden, .notOwner: editForbidden
        case .notFound: postNotFound
        case .unauthorized: loginRequired
        case .network: networkError
        case .titleTooLong: editTitleTooLong
        case .invalidResponse, .server: editOtherError
        }
    }

    private static func deleteMessage(_ failure: FeedFailure) -> String {
        switch failure {
        case .badRequest: deleteStateError
        case .notOwner, .forbidden, .banned: deleteForbidden
        case .notFound: postNotFound
        case .unauthorized: loginRequired
        case .network: networkError
        case .invalidResponse, .server, .titleTooLong: deleteOtherError
        }
    }

    private static func detailMessage(_ failure: FeedFailure) -> String? {
        switch failure {
        case .notFound: postNotFound
        case .unauthorized: nil
        case .network: networkError
        case .invalidResponse: postInvalid
        case .badRequest, .banned, .notOwner, .forbidden, .server, .titleTooLong: postLoadError
        }
    }

    /// 제목 표시: nil·공백만이면 "무제".
    public static func displayTitle(_ title: String?) -> String {
        title.flatMap(PostTitle.normalized) ?? untitled
    }

    /// 날짜 라벨 "{M}월 {d}일의 주제" (topicDate 문자열 기준, 기기 시간대 무관).
    public static func topicDateLabel(_ topicDate: KSTDate) -> String {
        "\(KST.monthDayLabel(topicDate))의 주제"
    }

    /// 사진 접근성 설명: "작품 이미지: {title}" 또는 제목이 없으면 "무제 작품 이미지".
    public static func photoAccessibilityLabel(title: String?) -> String {
        guard let title = title.flatMap(PostTitle.normalized) else { return "\(untitled) 작품 이미지" }
        return "작품 이미지: \(title)"
    }
}
