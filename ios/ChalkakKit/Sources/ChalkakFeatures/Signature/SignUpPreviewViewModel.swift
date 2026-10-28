import Foundation
import Observation
import ChalkakCore
import ChalkakNetwork
import ChalkakData

/// 가입 미리보기(3단계) + "시작하기" 요청.
@MainActor
@Observable
public final class SignUpPreviewViewModel {
    public private(set) var state: SignaturePreviewState = .ready
    /// 가입 컨텍스트(idToken·rawNonce). 가입 완료·로그인 복귀 때 폐기돼 nil이 된다.
    public private(set) var context: SignUpContext?
    public let draft: SignatureDraft

    /// "시작하기"가 눌리는 상태: `.ready`, `.failed`.
    public var isStartEnabled: Bool {
        switch state {
        case .ready, .failed: true
        case .submitting, .finished: false
        }
    }

    private let repository: any SignUpRepository
    private let pushRegistration: any PushRegistrationTrigger
    private let screenTracker: ScreenTracker?
    private let activeWork = ActiveWork()
    private var noticeIds = NoticeSequence()

    /// - Parameter context: nil이면(컨텍스트 소실) "시작하기"가 서버를 부르지 않고 `.finished(.loginRequired(sign.error.expired))`.
    public init(context: SignUpContext?, draft: SignatureDraft, repository: any SignUpRepository, pushRegistration: any PushRegistrationTrigger, screenTracker: ScreenTracker?) {
        self.context = context
        self.draft = draft
        self.repository = repository
        self.pushRegistration = pushRegistration
        self.screenTracker = screenTracker
    }

    /// `screen_view(onboarding_signature_preview)`.
    public func onAppear() {
        screenTracker?.screenAppeared(.onboardingSignaturePreview)
    }

    /// 진행 중·완료 뒤의 재탭은 무시한다. 성공이면 푸시 기기 등록을 시작하고 `.finished(.signedUp)`, 컨텍스트 폐기.
    /// 오류는 `SignUpPreviewErrorMapping`(아래 표)대로. 취소는 무음으로 `.ready`.
    ///
    /// | 오류 | 결과 |
    /// | --- | --- |
    /// | `CancellationError` | `.ready`(알림 없음) |
    /// | 401 | `.finished(.loginRequired(sign.error.expired))`, 컨텍스트 폐기 |
    /// | 403 | 서버 `message`를 그대로 보인다(없으면 `onb.signup.error.generic`) |
    /// | 400 BUSINESS_ERROR | `.finished(.returnToDrawing(sign.error.invalid))` — message로 분기하지 않는다(D-02) |
    /// | 404 | `.failed(onb.signup.error.reupload)` |
    /// | `SignUpError.processingTimeout` | `.failed(onb.signup.error.timeout)` |
    /// | `APIError.network` | `.failed(sign.error.network)` |
    /// | 그 밖(5xx, invalidResponse, uploadRejected, existingAccountNeedsSignUp, ConfigurationError …) | `.failed(onb.signup.error.generic)` |
    public func startTapped() async {
        guard isStartEnabled else { return }
        guard let context else {
            state = .finished(.loginRequired(noticeIds.make(SignatureCopy.errorExpired)))
            return
        }
        state = .submitting
        await activeWork.run { [self] in
            do {
                _ = try await repository.signUp(idToken: context.idToken, rawNonce: context.rawNonce, signaturePNG: draft.pngData)
                // 저장소가 성공을 돌려줬다면 세션은 이미 저장됐으므로 취소와 무관하게 끝까지 반영한다.
                await pushRegistration.registerDevice()
                self.context = nil
                state = .finished(.signedUp)
            } catch {
                handleFailure(error)
            }
        }
    }

    /// 서버 호출 없이 `.finished(.redraw)`.
    public func redrawTapped() {
        guard isStartEnabled else { return }
        state = .finished(.redraw)
    }

    public func dismissError() {
        if case .failed = state { state = .ready }
    }

    /// 진행 중인 요청을 취소하고 결과를 버린다.
    public func onDisappear() {
        activeWork.cancel()
    }

    private func handleFailure(_ error: any Error) {
        if error.isCancellation || (error as? AuthError) == .sessionChanged {
            state = .ready
            return
        }
        switch error {
        case APIError.http(401, _, _):
            context = nil
            state = .finished(.loginRequired(noticeIds.make(SignatureCopy.errorExpired)))
        case APIError.http(403, _, let serverMessage?) where !serverMessage.isEmpty:
            state = .failed(noticeIds.make(serverMessage))
        case APIError.http(400, .businessError, _):
            state = .finished(.returnToDrawing(noticeIds.make(SignatureCopy.errorInvalid)))
        case APIError.http(404, _, _):
            // 404는 확정 단계(업로드 못 찾음)만이다. 발급 단계 404는 저장소가 SignUpError로 감싸 generic이 된다.
            state = .failed(noticeIds.make(OnboardingCopy.signupErrorReupload))
        case SignUpError.processingTimeout:
            state = .failed(noticeIds.make(OnboardingCopy.signupErrorTimeout))
        case APIError.network:
            state = .failed(noticeIds.make(SignatureCopy.errorNetwork))
        default:
            state = .failed(noticeIds.make(OnboardingCopy.signupErrorGeneric))
        }
    }
}
