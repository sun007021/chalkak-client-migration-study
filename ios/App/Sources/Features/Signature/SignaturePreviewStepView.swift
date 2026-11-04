import SwiftUI
import UIKit
import ChalkakFeatures

/// 사인 미리보기 + "시작하기"(가입 3단계). 요청·오류 매핑·완료 처리는 `SignUpPreviewViewModel`이 맡는다.
struct SignaturePreviewStepView: View {
    let onRedraw: (Notice?) -> Void
    let onLoginRequired: (Notice) -> Void
    let onSignedUp: () -> Void
    @State private var viewModel: SignUpPreviewViewModel
    @State private var image: UIImage?

    init(
        container: AppContainer, context: SignUpContext, draft: SignatureDraft,
        onRedraw: @escaping (Notice?) -> Void, onLoginRequired: @escaping (Notice) -> Void, onSignedUp: @escaping () -> Void
    ) {
        self.onRedraw = onRedraw
        self.onLoginRequired = onLoginRequired
        self.onSignedUp = onSignedUp
        _viewModel = State(initialValue: container.makeSignUpPreviewViewModel(context: context, draft: draft))
        _image = State(initialValue: UIImage(data: draft.pngData))
    }

    var body: some View {
        ZStack {
            VStack(alignment: .leading, spacing: 0) {
                Text(OnboardingCopy.signPreviewTitle)
                    .font(ChalkakFont.title1)
                    .foregroundStyle(ChalkakColor.textPrimary)
                    .padding(.top, 50)
                    .accessibilityIdentifier("signature-preview.title")

                // 원본 OnboardingSignaturePreviewScreen(screens-a.md 6.2): 샘플 사진 5/6, 라운드 xlarge, 사인 112×84 우하단
                ZStack(alignment: .bottomTrailing) {
                    Image("preview_sunset")
                        .resizable()
                        .scaledToFill()
                    if let image {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 112, height: 84)
                            .padding(ChalkakSpacing.sm)
                            .accessibilityIdentifier("signature-preview.image")
                    }
                }
                .aspectRatio(5.0 / 6.0, contentMode: .fit)
                .background(ChalkakColor.inputBackground)
                .clipShape(RoundedRectangle(cornerRadius: ChalkakRadius.xlarge))
                .padding(.top, 50)

                Spacer(minLength: 0)

                if case .submitting = viewModel.state {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.bottom, ChalkakSpacing.lg)
                        .accessibilityIdentifier("signature-preview.loading")
                }

                HStack(spacing: 20) {
                    ChalkakOutlinedButton(title: OnboardingCopy.signPreviewRedraw, action: { viewModel.redrawTapped() }, isEnabled: viewModel.isStartEnabled, fillsWidth: true)
                        .accessibilityIdentifier("signature-preview.redraw-button")
                    ChalkakButton(title: OnboardingCopy.signPreviewStart, action: { Task { await viewModel.startTapped() } }, isEnabled: viewModel.isStartEnabled, fillsWidth: true)
                        .accessibilityIdentifier("signature-preview.confirm-button")
                }
            }
            .padding(.horizontal, ChalkakSpacing.screenHorizontal)
            .padding(.bottom, 18)

            if case .failed(let notice) = viewModel.state {
                ChalkakDialog(
                    identifier: "signature-preview.error-dialog",
                    title: nil,
                    message: notice.message,
                    messageIdentifier: "signature-preview.error-message"
                ) {
                    ChalkakDialogButton(title: "확인", identifier: "signature-preview.error-dialog-confirm-button") {
                        viewModel.dismissError()
                    }
                }
                .id(notice.id)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(ChalkakColor.background.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("signature-preview.root")
        .onAppear { viewModel.onAppear() }
        .onDisappear { viewModel.onDisappear() }
        .onChange(of: viewModel.state) { _, state in
            guard case .finished(let outcome) = state else { return }
            switch outcome {
            case .redraw: onRedraw(nil)
            case .returnToDrawing(let notice): onRedraw(notice)
            case .loginRequired(let notice): onLoginRequired(notice)
            case .signedUp: onSignedUp()
            case .changed: break
            }
        }
    }
}
