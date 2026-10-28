import SwiftUI
import ChalkakFeatures

/// 가입 흐름(약관 → 사인 그리기 → 미리보기)을 로그인 화면 위에 덮어 보인다. 단계 전이만 정하고 규칙은 각 ViewModel에 있다.
/// - 약관에서 뒤로 가면 로그인(컨텍스트 폐기), 사인에서 뒤로 가면 약관(동의 다시 받음), 미리보기 "다시 그리기"는 그리기.
/// - 가입 완료는 `onSignedUp`(회원 메인으로), 컨텍스트 소실(401)은 문구와 함께 `onExitToLogin`.
struct OnboardingHost: View {
    enum Step: Equatable {
        case terms
        case drawing
        case preview(SignatureDraft)
    }

    let container: AppContainer
    let context: SignUpContext
    let onExitToLogin: (String?) -> Void
    let onSignedUp: () -> Void

    @State private var step: Step = .terms
    /// 미리보기에서 거절돼 돌아온 경우 그리기 화면에 보일 오류.
    @State private var drawingNotice: Notice?

    var body: some View {
        ZStack {
            switch step {
            case .terms:
                TermsStepView(
                    container: container,
                    context: context,
                    onNext: {
                        drawingNotice = nil
                        step = .drawing
                    },
                    onBack: { onExitToLogin(nil) }
                )
            case .drawing:
                SignatureDrawingStepView(
                    container: container,
                    initialNotice: drawingNotice,
                    onBack: { step = .terms },
                    onPreview: { draft in step = .preview(draft) }
                )
            case .preview(let draft):
                SignaturePreviewStepView(
                    container: container,
                    context: context,
                    draft: draft,
                    onRedraw: { notice in
                        drawingNotice = notice
                        step = .drawing
                    },
                    onLoginRequired: { notice in onExitToLogin(notice.message) },
                    onSignedUp: onSignedUp
                )
            }
        }
        .background(ChalkakColor.background.ignoresSafeArea())
    }
}
