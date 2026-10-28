import Foundation

/// 내비게이션 문구. 값은 `shared/copy/ko.json`의 `nav.*`와 같아야 한다.
public enum NavCopy {
    public static func label(for tab: MainTab) -> String {
        switch tab {
        case .home: "홈"
        case .display: "전시"
        case .record: "기록"
        case .settings: "설정"
        }
    }
    public static let uploadAccessibilityLabel = "추가"
    public static let guestRecord = "기록을 보려면 로그인이 필요해요"
    public static let guestUpload = "게시물을 추가하려면 로그인이 필요해요"
    public static let guestFeed = "게시물 피드를 보려면 로그인이 필요해요"
    public static let guestLike = "좋아요를 누르려면 로그인이 필요해요"
    public static let guestNotification = "로그인 후 알림을 확인할 수 있어요"
    public static let guestFeedback = "피드백을 보내려면 로그인이 필요해요"
    public static let postDeleted = "게시물을 삭제했어요"
}
