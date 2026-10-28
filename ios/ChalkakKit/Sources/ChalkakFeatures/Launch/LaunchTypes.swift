import Foundation
import ChalkakData

/// 메인(홈) 접근 모드.
public enum MainAccess: Sendable, Equatable {
    case member
    case guest
}

/// 로그인 화면이 끝났을 때 앱이 가야 할 곳.
public enum LoginDestination: Sendable, Equatable {
    case main(MainAccess)
    case terms(SignUpContext)
}

/// SIGN_UP_REQUIRED일 때 가입 완료까지 메모리에만 두는 값. 문자열화에 값이 새지 않는다.
public struct SignUpContext: Sendable, Equatable, RedactedDescription {
    public let idToken: String
    public let rawNonce: String
    public init(idToken: String, rawNonce: String) {
        self.idToken = idToken
        self.rawNonce = rawNonce
    }
}

/// 푸시 기기 등록 시작 훅(PUSH PR이 구현). 로그인 성공·인증 상태로 시작할 때 호출된다.
/// 등록을 시작만 하고 즉시 반환해야 한다(호출자가 화면 전환 전에 기다린다).
public protocol PushRegistrationTrigger: Sendable {
    func registerDevice() async
}

/// 홈 프리로드(HOME PR이 구현). 게스트면 공개 데이터만 불러야 한다. 오류는 홈이 오류 상태로 연다.
public protocol HomePreloading: Sendable {
    func preload(access: MainAccess) async throws
}

/// "업데이트" 버튼이 여는 스토어 인터페이스.
public protocol StoreOpening: Sendable {
    func openStore() async
}
