import ChalkakData

/// 설정 탭 문구(`settings.*`). 값은 `shared/copy/ko.json`과 같아야 한다.
public enum SettingsCopy {
    public static let sectionApp = "앱 설정"
    public static let sectionPush = "푸시 알림"
    public static let sectionAccount = "계정"
    public static let sectionFeedback = "피드백"
    public static let sectionInfo = "정보 및 약관"
    public static let rowFeedback = "피드백 보내기"
    public static let rowPrivacy = "개인정보처리방침"
    public static let rowTerms = "이용약관"
    public static let rowVersion = "버전정보"
    public static let rowLogout = "로그아웃"
    public static let rowWithdraw = "회원탈퇴"
    public static let guestLogin = "로그인"
    public static let pushTopic = "오늘 주제 알림"
    public static let pushModeration = "게시물 승인·반려 알림"
    public static let pushAIReview = "AI 피드백 완료 알림"
    public static let pushLoadError = "알림 설정을 불러오지 못했어요. 다시 시도해 주세요."
    public static let pushSaveError = "알림 설정을 저장하지 못했어요. 다시 시도해 주세요."

    public static func pushLabel(for kind: NotificationSettingKind) -> String {
        switch kind {
        case .topic: pushTopic
        case .moderation: pushModeration
        case .aiReview: pushAIReview
        }
    }
}
