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
                    .font(ChalkakFont.title1)
                    .foregroundStyle(ChalkakColor.textPrimary)
                    .padding(.top, ChalkakSpacing.xl)
                    .accessibilityIdentifier("signature-preview.title")

                // 원본 변경 미리보기(screens-a.md 6.4): 샘플 사진 5/6, 사인 112×84 우하단
                ZStack(alignment: .bottomTrailing) {
                    Image("preview_photo")
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
                .padding(.top, 36)

                Text(SignatureCopy.changeNotice)
                    .font(ChalkakFont.subheadline)
                    .foregroundStyle(ChalkakColor.textMuted)
                    .padding(.top, ChalkakSpacing.sm)
                    .accessibilityIdentifier("signature-preview.change-notice")

                Spacer(minLength: 0)

                if case .submitting = viewModel.state {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.bottom, ChalkakSpacing.lg)
                        .accessibilityIdentifier("signature-preview.loading")
                }

                HStack(spacing: 20) {
                    ChalkakOutlinedButton(title: OnboardingCopy.signPreviewRedraw, action: { viewModel.redrawTapped() }, isEnabled: viewModel.isChangeEnabled, fillsWidth: true)
                        .accessibilityIdentifier("signature-preview.redraw-button")
                    ChalkakButton(title: SignatureCopy.changeConfirm, action: { Task { await viewModel.changeTapped() } }, isEnabled: viewModel.isChangeEnabled, fillsWidth: true)
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
