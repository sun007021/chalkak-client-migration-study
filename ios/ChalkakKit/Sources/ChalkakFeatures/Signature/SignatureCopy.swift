/// 사인 변경·사인 카드·사인 오류 문구(`sign.*`)와 정지 안내 `auth.banned.signature`. 값은 ko.json과 같아야 한다.
public enum SignatureCopy {
    public static let cardTitle = "사인 재설정"
    public static let cardChange = "변경하기"
    public static let changeConfirm = "사인 변경하기"
    public static let changeNotice = "사인 변경까지 시간이 조금 걸릴 수 있어요"
    public static let changeDone = "사인 반영까지 시간이 좀 걸릴 수 있어요!"
    public static let changeErrorGeneric = "사인을 저장하지 못했어요. 다시 시도해 주세요."
    public static let changeErrorNotFound = "사인 업로드를 찾을 수 없어요. 다시 시도해 주세요."
    public static let loadError = "사인을 불러오지 못했어요. 다시 시도해 주세요."
    public static let errorTooLarge = "사인 이미지가 1MB를 초과했어요."
    public static let errorNetwork = "네트워크 연결을 확인해 주세요."
    public static let errorInvalid = "사용할 수 없는 사인이에요. 다시 그려주세요."
    public static let errorExpired = "로그인 정보가 만료되었어요. 다시 로그인해 주세요."
    public static let bannedSignature = "이용이 제한되어 사인을 변경할 수 없어요."
}
