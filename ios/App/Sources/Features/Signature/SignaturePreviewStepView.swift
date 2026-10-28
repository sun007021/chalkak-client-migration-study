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
                    .font(ChalkakFont.display)
                    .foregroundStyle(ChalkakColor.textPrimary)
                    .padding(.top, 68)
                    .accessibilityIdentifier("signature-preview.title")

                // 내보내는 PNG의 획이 흰색이라 어두운 배경 위에 보인다(REQ-SIGN-010).
                ZStack {
                    ChalkakColor.actionPrimary
                    if let image {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFit()
                            .accessibilityIdentifier("signature-preview.image")
                    }
                }
                .aspectRatio(SignaturePadMetrics.aspectRatio, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: ChalkakRadius.card))
                .padding(.top, 48)

                Spacer(minLength: 0)

                if case .submitting = viewModel.state {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.bottom, ChalkakSpacing.lg)
                        .accessibilityIdentifier("signature-preview.loading")
                }

                HStack(spacing: ChalkakSpacing.md) {
                    Button { viewModel.redrawTapped() } label: {
                        Text(OnboardingCopy.signPreviewRedraw)
                            .font(ChalkakFont.callout)
                            .foregroundStyle(ChalkakColor.textPrimary)
                            .frame(maxWidth: .infinity, minHeight: 56)
                            .background(ChalkakColor.inputBackground, in: RoundedRectangle(cornerRadius: ChalkakRadius.button))
                            .overlay(RoundedRectangle(cornerRadius: ChalkakRadius.button).stroke(ChalkakColor.border, lineWidth: 1))
                            .opacity(viewModel.isStartEnabled ? 1 : 0.3)
                    }
                    .buttonStyle(.plain)
                    .disabled(!viewModel.isStartEnabled)
                    .accessibilityIdentifier("signature-preview.redraw-button")

                    Button { Task { await viewModel.startTapped() } } label: {
                        Text(OnboardingCopy.signPreviewStart)
                            .font(ChalkakFont.callout)
                            .foregroundStyle(ChalkakColor.onActionPrimary)
                            .frame(maxWidth: .infinity, minHeight: 56)
                            .background(ChalkakColor.actionPrimary, in: RoundedRectangle(cornerRadius: ChalkakRadius.button))
                            .opacity(viewModel.isStartEnabled ? 1 : 0.3)
                    }
                    .buttonStyle(.plain)
                    .disabled(!viewModel.isStartEnabled)
                    .accessibilityIdentifier("signature-preview.confirm-button")
                }
            }
            .padding(.horizontal, ChalkakSpacing.screenHorizontal)
            .padding(.bottom, ChalkakSpacing.xl)

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
