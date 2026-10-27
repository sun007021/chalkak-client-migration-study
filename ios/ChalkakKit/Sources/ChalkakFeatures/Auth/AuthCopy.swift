/// 인증·시작 화면 문구(boot-auth.md §문구). 키 이름은 명세와 같다. Core `Copy`가 생기면 옮긴다.
public enum AuthCopy {
    public static let updateTitle = "업데이트가 필요해요"
    public static let updateBody = "원활한 서비스 이용을 위해 최신 버전으로 업데이트해 주세요."
    public static let updateButton = "업데이트"
    public static let loginTagline = "매일 하나의 주제,\n각자의 한 장"
    public static let loginKakao = "카카오로 계속하기"
    public static let loginGuest = "로그인 없이 사진 둘러보기"
    public static let loginErrorNetwork = "네트워크 연결을 확인해 주세요."
    public static let loginErrorKakaoAccount = "카카오 계정을 확인할 수 없어요. 다시 시도해 주세요."
    public static let loginErrorConfig = "카카오 로그인 설정을 확인해 주세요."
    public static let loginErrorKakaoFailed = "카카오 로그인에 실패했어요. 다시 시도해 주세요."
    public static let loginErrorInvalidResponse = "로그인 응답을 확인할 수 없어요. 다시 시도해 주세요."
    public static let loginErrorGeneric = "로그인하지 못했어요. 다시 시도해 주세요."
    public static let loginErrorGuest = "화면을 불러오지 못했어요. 다시 시도해 주세요."
    public static let loginErrorTitle = "로그인"
    public static let logoutConfirmMessage = "정말 로그아웃 하시겠습니까?"
    public static let logoutConfirmOK = "로그아웃"
    public static let withdrawConfirmMessage = "정말 회원탈퇴 하시겠습니까?"
    public static let withdrawConfirmOK = "회원탈퇴"
    public static let confirmCancel = "취소"
    public static let withdrawError = "요청을 처리하지 못했어요. 다시 시도해 주세요."
}

extension ConfirmationPrompt {
    static let logout = ConfirmationPrompt(message: AuthCopy.logoutConfirmMessage, confirmTitle: AuthCopy.logoutConfirmOK, cancelTitle: AuthCopy.confirmCancel)
    static let withdraw = ConfirmationPrompt(message: AuthCopy.withdrawConfirmMessage, confirmTitle: AuthCopy.withdrawConfirmOK, cancelTitle: AuthCopy.confirmCancel)
}
