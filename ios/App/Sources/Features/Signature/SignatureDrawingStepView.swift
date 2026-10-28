import SwiftUI
import ChalkakFeatures

/// 사인 그리기 화면(가입 2단계). 획·되돌리기·확정 가능 여부·PNG 변환은 `SignatureDrawingViewModel`이 맡는다.
struct SignatureDrawingStepView: View {
    let onBack: () -> Void
    let onPreview: (SignatureDraft) -> Void
    /// 가입은 "onboarding", 설정 사인 변경은 "change"(testids의 mode 노출).
    private let mode: String
    /// 부모가 나중에 전하는 오류(변경 흐름: 미리보기에서 거절돼 돌아온 경우). 값이 생기면 화면이 보인다.
    private let incomingNotice: Notice?
    @State private var viewModel: SignatureDrawingViewModel
    /// 미리보기에서 거절돼 돌아온 경우의 오류. 다시 그리기 시작하면 지운다.
    @State private var carriedNotice: Notice?

    init(container: AppContainer, initialNotice: Notice?, onBack: @escaping () -> Void, onPreview: @escaping (SignatureDraft) -> Void) {
        self.onBack = onBack
        self.onPreview = onPreview
        mode = "onboarding"
        incomingNotice = nil
        _viewModel = State(initialValue: container.makeSignatureDrawingViewModel(kind: .onboarding))
        _carriedNotice = State(initialValue: initialNotice)
    }

    /// 이미 만들어 둔 ViewModel을 쓴다(사인 변경: 미리보기에서 돌아와도 같은 ViewModel을 이어 쓰고 "다시 그리기"로 비운다).
    init(
        viewModel: SignatureDrawingViewModel, mode: String, incomingNotice: Notice?,
        onBack: @escaping () -> Void, onPreview: @escaping (SignatureDraft) -> Void
    ) {
        self.onBack = onBack
        self.onPreview = onPreview
        self.mode = mode
        self.incomingNotice = incomingNotice
        _viewModel = State(initialValue: viewModel)
        _carriedNotice = State(initialValue: incomingNotice)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(ChalkakColor.iconPrimary)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("signature.back-button")

            Text(OnboardingCopy.signTitle)
                .font(ChalkakFont.display)
                .foregroundStyle(ChalkakColor.textPrimary)
                .padding(.top, ChalkakSpacing.lg)
                .accessibilityIdentifier("signature.title")
            Text(OnboardingCopy.signGuide)
                .font(ChalkakFont.subheadline)
                .foregroundStyle(ChalkakColor.textSecondary)
                .padding(.top, ChalkakSpacing.md)
                .accessibilityIdentifier("signature.guide-text")

            ZStack {
                SignaturePad(
                    strokes: viewModel.drawing.strokes,
                    onBegan: { point in
                        carriedNotice = nil
                        viewModel.dismissNotice()
                        viewModel.strokeBegan(at: point)
                    },
                    onMoved: { viewModel.strokeMoved(to: $0) },
                    onEnded: { viewModel.strokeEnded() }
                )
                if !viewModel.canUndo {
                    Text(OnboardingCopy.signPadHint)
                        .font(ChalkakFont.callout)
                        .foregroundStyle(ChalkakColor.textSecondary)
                        .allowsHitTesting(false)
                        .accessibilityIdentifier("signature.canvas-hint")
                }
            }
            .padding(.top, ChalkakSpacing.xl)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("signature.canvas")

            HStack(spacing: ChalkakSpacing.md) {
                secondaryButton(OnboardingCopy.signUndo, identifier: "signature.undo-button", enabled: viewModel.canUndo) {
                    viewModel.undoTapped()
                }
                secondaryButton(OnboardingCopy.signClear, identifier: "signature.clear-button", enabled: viewModel.canClear) {
                    viewModel.clearTapped()
                }
            }
            .padding(.top, ChalkakSpacing.lg)

            if let message = viewModel.notice?.message ?? carriedNotice?.message {
                Text(message)
                    .font(ChalkakFont.footnote)
                    .foregroundStyle(ChalkakColor.error)
                    .padding(.top, ChalkakSpacing.md)
                    .accessibilityIdentifier("signature.error-message")
            }

            Spacer(minLength: 0)

            Button { Task { await viewModel.confirmTapped() } } label: {
                Text(OnboardingCopy.signConfirm)
                    .font(ChalkakFont.callout)
                    .foregroundStyle(ChalkakColor.onActionPrimary)
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .background(ChalkakColor.actionPrimary, in: RoundedRectangle(cornerRadius: ChalkakRadius.button))
                    .opacity(viewModel.canConfirm ? 1 : 0.3)
            }
            .buttonStyle(.plain)
            .disabled(!viewModel.canConfirm)
            .accessibilityIdentifier("signature.submit-button")
        }
        .padding(.horizontal, ChalkakSpacing.screenHorizontal)
        .padding(.bottom, ChalkakSpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(ChalkakColor.background.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityValue(mode)
        .accessibilityIdentifier("signature.root")
        .onAppear { viewModel.onAppear() }
        .onChange(of: incomingNotice) { _, notice in
            if let notice { carriedNotice = notice }
        }
        .onChange(of: viewModel.route) { _, route in
            guard let route else { return }
            viewModel.consumeRoute()
            switch route {
            case .preview(let draft): onPreview(draft)
            }
        }
    }

    private func secondaryButton(_ title: String, identifier: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(ChalkakFont.subheadline)
                .foregroundStyle(ChalkakColor.textPrimary)
                .padding(.horizontal, ChalkakSpacing.lg)
                .frame(minHeight: 40)
                .background(ChalkakColor.inputBackground, in: Capsule())
                .overlay(Capsule().stroke(ChalkakColor.border, lineWidth: 1))
                .opacity(enabled ? 1 : 0.3)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityIdentifier(identifier)
    }
}
