/// 피드백 화면 문구(`fdbk.*`)와 연결 실패 공통 문구. 값은 `shared/copy/ko.json`과 같아야 한다.
public enum FeedbackCopy {
    public static let title = "피드백"
    public static let introTitle = "찰칵을 사용하며\n느낀 점을 알려주세요."
    public static let introBody = "서비스 이용 중 불편한 점이나 개선되었으면 하는 점을\n자유롭게 남겨주세요."
    public static let fieldLabel = "피드백 내용"
    public static let fieldPlaceholder = "내용을 입력해 주세요."
    public static let send = "보내기"
    public static let sending = "보내는 중..."
    public static let success = "피드백을 보내주셔서 감사해요."
    public static let errorInvalid = "피드백은 1자 이상 1000자 이하로 입력해 주세요."
    public static let errorGeneric = "피드백을 보내지 못했어요. 다시 시도해 주세요."
    /// 연결 실패·타임아웃(`common.error.network`).
    public static let errorNetwork = "네트워크 연결을 확인해 주세요."
}
