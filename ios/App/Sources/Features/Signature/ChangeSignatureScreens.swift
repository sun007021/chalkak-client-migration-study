import SwiftUI
import UIKit
import ChalkakFeatures

/// 설정 사인 변경 1단계(그리기). 가입과 같은 그리기 화면을 변경 모드로 쓴다. ViewModel은 세션이 쥐어 미리보기에서 돌아와도 이어 쓴다.
struct ChangeSignatureDrawingScreen: View {
    let container: AppContainer
    let session: MainSession

    var body: some View {
        if let viewModel = session.changeSignatureDrawing {
            SignatureDrawingStepView(
                viewModel: viewModel,
                mode: "change",
                incomingNotice: session.changeSignatureNotice,
                onBack: { session.shell.pop() },
                onPreview: { draft in session.showSignatureChangePreview(draft) }
            )
        } else {
            // 세션이 그리기 ViewModel 없이 이 경로를 만들 수 없다. 방어적으로 빈 화면을 닫을 수 있게만 둔다.
            ChalkakColor.background.ignoresSafeArea()
                .onAppear { session.shell.pop() }
        }
    }
}

/// 설정 사인 변경 2단계(미리보기 + "사인 변경하기"). 요청·오류 매핑은 `SignatureChangePreviewViewModel`이 맡는다.
struct ChangeSignaturePreviewScreen: View {
    let container: AppContainer
    let session: MainSession
    @State private var viewModel: SignatureChangePreviewViewModel?
    @State private var image: UIImage?

    init(container: AppContainer, session: MainSession) {
        self.container = container
        self.session = session
        if let draft = session.changeSignatureDraft {
            _viewModel = State(initialValue: container.makeSignatureChangePreviewViewModel(draft: draft))
            _image = State(initialValue: UIImage(data: draft.pngData))
        }
    }

    var body: some View {
        if let viewModel {
            content(viewModel)
        } else {
            ChalkakColor.background.ignoresSafeArea()
                .onAppear { session.shell.pop() }
        }
    }

    private func content(_ viewModel: SignatureChangePreviewViewModel) -> some View {
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

                Text(SignatureCopy.changeNotice)
                    .font(ChalkakFont.subheadline)
                    .foregroundStyle(ChalkakColor.textSecondary)
                    .padding(.top, ChalkakSpacing.lg)
                    .accessibilityIdentifier("signature-preview.change-notice")

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
                            .opacity(viewModel.isChangeEnabled ? 1 : 0.3)
                    }
                    .buttonStyle(.plain)
                    .disabled(!viewModel.isChangeEnabled)
                    .accessibilityIdentifier("signature-preview.redraw-button")

                    Button { Task { await viewModel.changeTapped() } } label: {
                        Text(SignatureCopy.changeConfirm)
                            .font(ChalkakFont.callout)
                            .foregroundStyle(ChalkakColor.onActionPrimary)
                            .frame(maxWidth: .infinity, minHeight: 56)
                            .background(ChalkakColor.actionPrimary, in: RoundedRectangle(cornerRadius: ChalkakRadius.button))
                            .opacity(viewModel.isChangeEnabled ? 1 : 0.3)
                    }
                    .buttonStyle(.plain)
                    .disabled(!viewModel.isChangeEnabled)
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
        .accessibilityValue("change")
        .accessibilityIdentifier("signature-preview.root")
        .onAppear { viewModel.onAppear() }
        .onDisappear { viewModel.onDisappear() }
        .onChange(of: viewModel.state) { _, state in
            guard case .finished(let outcome) = state else { return }
            switch outcome {
            case .redraw:
                session.returnToSignatureDrawing(notice: nil)
            case .returnToDrawing(let notice):
                session.returnToSignatureDrawing(notice: notice)
            case .loginRequired(let notice):
                container.toast.show(notice.message)
                Task { await container.launch.handleReauthenticationRequired() }
            case .changed(let notice):
                container.toast.show(notice.message)
                Task { await session.completeSignatureChange() }
            case .signedUp:
                break // 가입 흐름의 결과다. 변경 화면에서는 나오지 않는다.
            }
        }
    }
}
