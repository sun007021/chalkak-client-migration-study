import Foundation
import Observation
import ChalkakNetwork
import ChalkakData

public enum AccountAction: Sendable, Equatable {
    case logout
    case withdraw
}

/// 설정 화면이 쓰는 로그아웃·탈퇴 유스케이스(화면 UI는 SET PR).
@MainActor
@Observable
public final class AccountSessionViewModel {
    public enum State: Sendable, Equatable {
        case idle
        case confirming(AccountAction, ConfirmationPrompt)
        case processing(AccountAction)
        /// 로컬 정리 끝. 앱은 `AppLaunchViewModel.accountSessionEnded()`로 로그인 화면에 간 뒤 `consumeResult()`로 되돌린다.
        case finished(AccountAction)
        /// 탈퇴가 갱신 후에도 401 UNAUTHORIZED. 세션은 그대로 두고 로그인 화면으로만 보낸다(문구 없음).
        /// 앱은 `.finished`와 똑같이 `AppLaunchViewModel.accountSessionEnded()`로 연결하고 `consumeResult()`로 되돌린다.
        case needsLogin
    }

    public private(set) var state: State = .idle
    public private(set) var toast: Notice?

    /// 처리 중에는 해당 버튼이 비활성이다.
    public var isBusy: Bool {
        if case .processing = state { true } else { false }
    }

    private let authRepository: any AuthRepository
    private let activeWork = ActiveWork()
    private var toastIds = NoticeSequence()

    public init(authRepository: any AuthRepository) {
        self.authRepository = authRepository
    }

    /// 확인 대화상자(`auth.logout.confirm.*`)를 연다.
    public func logoutTapped() {
        openConfirmation(.logout, prompt: .logout)
    }

    /// 확인 대화상자(`auth.withdraw.confirm.*`)를 연다.
    public func withdrawTapped() {
        openConfirmation(.withdraw, prompt: .withdraw)
    }

    /// 취소하면 아무 변화가 없다(서버·저장소 호출 0).
    public func cancelConfirmation() {
        if case .confirming = state { state = .idle }
    }

    /// 확인 상태에서만 실행한다(연타해도 1회). 로컬 정리만 기다리고 바로 `.finished(.logout)`이 된다.
    /// 서버 로그아웃 호출은 화면 취소와 무관한 별도 작업으로 보내며 실패는 무시한다(REQ-AUTH-033).
    public func confirmLogout() async {
        guard case .confirming(.logout, _) = state else { return }
        state = .processing(.logout)
        let pending = await authRepository.logoutLocally()
        state = .finished(.logout)
        guard let pending else { return }
        let repository = authRepository
        Task { await repository.sendLogout(pending) }
    }

    /// 확인 상태에서만 실행한다(연타해도 1회). 성공 `.finished(.withdraw)`. 실패는 `.idle` + 토스트 `auth.withdraw.error`(세션 유지).
    /// 갱신 후에도 401 UNAUTHORIZED면 `.needsLogin`. REAUTHENTICATION_REQUIRED·취소는 문구 없이 `.idle`(라우팅은 AuthEvents 몫).
    public func confirmWithdraw() async {
        guard case .confirming(.withdraw, _) = state else { return }
        state = .processing(.withdraw)
        await activeWork.run { [self] in
            do {
                try await authRepository.withdraw()
                state = .finished(.withdraw)
            } catch {
                handleWithdrawFailure(error)
            }
        }
    }

    /// 화면 이탈: 진행 중인 탈퇴 요청을 취소한다(취소 오류는 토스트로 보이지 않는다). 로그아웃의 서버 호출은 취소하지 않는다.
    public func onDisappear() {
        activeWork.cancel()
    }

    /// 앱이 `.finished`·`.needsLogin`을 소비(로그인 화면으로 이동)한 뒤 `.idle`로 되돌린다. 설정 화면이 다시 열릴 때 버튼이 동작하게 한다.
    public func consumeResult() {
        switch state {
        case .finished, .needsLogin: state = .idle
        case .idle, .confirming, .processing: break
        }
    }

    private func openConfirmation(_ action: AccountAction, prompt: ConfirmationPrompt) {
        guard case .idle = state else { return }
        state = .confirming(action, prompt)
    }

    private func handleWithdrawFailure(_ error: any Error) {
        switch error {
        case APIError.http(401, .unauthorized, _):
            state = .needsLogin
        case APIError.http(_, .reauthenticationRequired, _), AuthError.sessionChanged:
            state = .idle
        case _ where error.isCancellation:
            state = .idle
        default:
            toast = toastIds.make(AuthCopy.withdrawError)
            state = .idle
        }
    }
}
