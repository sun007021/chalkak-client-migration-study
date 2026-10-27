import Foundation
import Observation
import ChalkakCore
import ChalkakNetwork
import ChalkakData

/// 로그인 실패를 화면에 어떻게 보일지. 취소는 무음이다.
public enum LoginErrorPresentation: Sendable, Equatable {
    case silent
    case message(String)
}

/// 서버·SDK 오류 → 로그인 화면 문구(boot-auth.md §카카오 로그인 표).
public enum LoginErrorMapper {
    /// 서버 로그인 단계의 오류.
    public static func presentation(for error: any Error) -> LoginErrorPresentation {
        if error.isCancellation || (error as? SocialLoginError) == .cancelled || (error as? AuthError) == .sessionChanged { return .silent }
        switch error {
        case let error as SocialLoginError:
            return presentation(forSDKError: error)
        case APIError.network:
            return .message(AuthCopy.loginErrorNetwork)
        case APIError.invalidResponse:
            return .message(AuthCopy.loginErrorInvalidResponse)
        case APIError.http(401, .unauthorized, _):
            return .message(AuthCopy.loginErrorKakaoAccount)
        case APIError.http(403, .forbidden, let serverMessage?) where !serverMessage.isEmpty:
            return .message(serverMessage)
        default:
            return .message(AuthCopy.loginErrorGeneric)
        }
    }

    /// 카카오 SDK 단계의 오류. 설정 오류가 아닌 알 수 없는 오류는 모두 SDK 일반 실패다.
    public static func presentation(forSDKError error: any Error) -> LoginErrorPresentation {
        if error.isCancellation || (error as? SocialLoginError) == .cancelled { return .silent }
        return .message((error as? SocialLoginError) == .configuration ? AuthCopy.loginErrorConfig : AuthCopy.loginErrorKakaoFailed)
    }
}

@MainActor
@Observable
public final class LoginViewModel {
    public enum State: Sendable, Equatable {
        case idle
        case authenticatingWithKakao
        case signingIn
        case enteringGuest
        case failed(Notice)
        case completed(LoginDestination)
    }

    public private(set) var state: State = .idle

    /// idle·failed에서만 두 버튼이 눌린다.
    public var isInteractionEnabled: Bool {
        switch state {
        case .idle, .failed: true
        case .authenticatingWithKakao, .signingIn, .enteringGuest, .completed: false
        }
    }

    private let authRepository: any AuthRepository
    private let socialLogin: any SocialLoginClient
    private let nonceFactory: KakaoNonceFactory
    private let pushRegistration: any PushRegistrationTrigger
    private let screenTracker: ScreenTracker?
    private let activeWork = ActiveWork()
    private var noticeIds = NoticeSequence()

    public init(
        authRepository: any AuthRepository,
        socialLogin: any SocialLoginClient,
        nonceFactory: KakaoNonceFactory,
        pushRegistration: any PushRegistrationTrigger,
        screenTracker: ScreenTracker?
    ) {
        self.authRepository = authRepository
        self.socialLogin = socialLogin
        self.nonceFactory = nonceFactory
        self.pushRegistration = pushRegistration
        self.screenTracker = screenTracker
    }

    /// 화면이 보일 때 `screen_view(login)`.
    /// 약관 등에서 돌아왔을 때도 불린다: 끝난 결과(`.completed`)는 소비한다.
    public func onAppear() {
        screenTracker?.screenAppeared(.login)
        consumeCompletion()
    }

    /// 앱이 `.completed` 목적지를 처리한 뒤(또는 화면에 돌아왔을 때) `.idle`로 되돌린다. 다른 상태는 건드리지 않는다.
    public func consumeCompletion() {
        if case .completed = state { state = .idle }
    }

    /// 화면이 사라질 때: 진행 중인 요청을 취소하고 결과를 버린다(세션 저장·오류 표시 없음).
    public func onDisappear() {
        activeWork.cancel()
    }

    /// 새 nonce → SDK(해시 nonce) → idToken 없으면 config 오류(서버 호출 0) → `socialLogin(idToken, rawNonce)`.
    /// LOGIN_SUCCESS: 푸시 등록 트리거 후 `.completed(.main(.member))`. SIGN_UP_REQUIRED: `.completed(.terms(...))`.
    /// 진행 중(또는 완료 후)의 재탭은 무시한다. 취소는 `.idle`로 무음 복귀.
    public func kakaoTapped() async {
        guard isInteractionEnabled else { return }
        let nonce = nonceFactory.make()
        state = .authenticatingWithKakao
        await activeWork.run { [self] in await performKakaoLogin(nonce: nonce) }
    }

    /// 서버 호출 없이 `enterGuestMode()`. 실패하면 로그인 화면에 머물며 `auth.login.error.guest`.
    public func guestTapped() async {
        guard isInteractionEnabled else { return }
        state = .enteringGuest
        do {
            try await authRepository.enterGuestMode()
            state = .completed(.main(.guest))
        } catch {
            fail(error.isCancellation ? .silent : .message(AuthCopy.loginErrorGuest))
        }
    }

    /// 오류 알림을 닫고 `.idle`로.
    public func dismissError() {
        if case .failed = state { state = .idle }
    }

    private func performKakaoLogin(nonce: KakaoNonce) async {
        let credential: KakaoCredential
        do {
            credential = try await socialLogin.authenticate(hashedNonce: nonce.hashed)
        } catch {
            return fail(LoginErrorMapper.presentation(forSDKError: error))
        }
        guard !Task.isCancelled else { return fail(.silent) }
        guard let idToken = credential.idToken, !idToken.isEmpty else { return fail(.message(AuthCopy.loginErrorConfig)) }

        state = .signingIn
        let outcome: SocialLoginOutcome
        do {
            outcome = try await authRepository.socialLogin(idToken: idToken, rawNonce: nonce.raw)
        } catch {
            return fail(LoginErrorMapper.presentation(for: error))
        }
        // 저장이 시작된 로그인은 취소와 무관하게 끝까지 반영한다(R2). 가입 필요는 아무것도 저장하지 않았으므로 취소를 존중한다.
        switch outcome {
        case .loggedIn:
            await pushRegistration.registerDevice()
            state = .completed(.main(.member))
        case .signUpRequired:
            guard !Task.isCancelled else { return fail(.silent) }
            state = .completed(.terms(SignUpContext(idToken: idToken, rawNonce: nonce.raw)))
        }
    }

    /// 무음이면 조용히 대기 상태로, 문구가 있으면 오류 알림.
    private func fail(_ presentation: LoginErrorPresentation) {
        switch presentation {
        case .silent: state = .idle
        case .message(let message): state = .failed(noticeIds.make(message))
        }
    }
}
