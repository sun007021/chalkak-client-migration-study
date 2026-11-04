import SwiftUI
import ChalkakFeatures

/// 약관 동의 화면(가입 1단계). 체크·다음 가능 여부·문서 열기는 `TermsViewModel`이 정한다.
struct TermsStepView: View {
    let container: AppContainer
    let onNext: () -> Void
    let onBack: () -> Void
    @State private var viewModel: TermsViewModel

    init(container: AppContainer, context: SignUpContext, onNext: @escaping () -> Void, onBack: @escaping () -> Void) {
        self.container = container
        self.onNext = onNext
        self.onBack = onBack
        _viewModel = State(initialValue: container.makeTermsViewModel(context: context))
    }

    var body: some View {
        // 원본 OnboardingTermsScreen(screens-a.md 5.1): 바탕 inputBackground, 타이틀 title1, 간격 50 → 57 → 전체 동의 카드 → 3 → 필수 행 → 다음
        VStack(alignment: .leading, spacing: 0) {
            ChalkakNavigationButton(kind: .back) { viewModel.backTapped() }
                .accessibilityIdentifier("terms.back-button")
                .padding(.leading, -ChalkakSpacing.sm)

            Text(OnboardingCopy.termsTitle)
                .font(ChalkakFont.title1)
                .foregroundStyle(ChalkakColor.textPrimary)
                .padding(.top, 2)
                .accessibilityIdentifier("terms.title")

            allConsentRow
                .padding(.top, 57)

            VStack(spacing: 0) {
                requiredRow(
                    title: OnboardingCopy.termsService, isOn: viewModel.agreedToService,
                    checkIdentifier: "terms.service-checkbox", viewIdentifier: "terms.service-view-button",
                    toggle: { viewModel.toggleService() },
                    view: { Task { await viewModel.viewDocument(.service) } }
                )
                termsDivider
                requiredRow(
                    title: OnboardingCopy.termsPrivacy, isOn: viewModel.agreedToPrivacy,
                    checkIdentifier: "terms.privacy-checkbox", viewIdentifier: "terms.privacy-view-button",
                    toggle: { viewModel.togglePrivacy() },
                    view: { Task { await viewModel.viewDocument(.privacy) } }
                )
                termsDivider
            }
            .padding(.top, 3)

            Spacer(minLength: 0)

            ChalkakButton(title: OnboardingCopy.termsNext, action: { viewModel.nextTapped() }, isEnabled: viewModel.canProceed, fillsWidth: true)
                .accessibilityIdentifier("terms.next-button")
        }
        .padding(.horizontal, ChalkakSpacing.screenHorizontal)
        .padding(.bottom, 20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(ChalkakColor.inputBackground.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("terms.root")
        .onAppear { viewModel.onAppear() }
        .onChange(of: viewModel.destination) { _, destination in
            guard let destination else { return }
            viewModel.consumeDestination()
            switch destination {
            case .signature: onNext()
            case .login: onBack()
            }
        }
        .onChange(of: viewModel.notice) { _, notice in
            if let notice { container.toast.show(notice.message) }
        }
        .sheet(isPresented: documentBinding) {
            if let presentation = viewModel.presentedDocument {
                LegalDocumentSheet(container: container, presentation: presentation) { viewModel.documentDismissed() }
            }
        }
    }

    private var documentBinding: Binding<Bool> {
        Binding(
            get: { viewModel.presentedDocument != nil },
            set: { isPresented in if !isPresented { viewModel.documentDismissed() } }
        )
    }

    private var termsDivider: some View {
        Rectangle().fill(ChalkakColor.border).frame(height: 1)
    }

    /// 전체 동의 카드: 체크박스 22 + body, 패딩 16/19, 배경 inputBackground, 테두리 #E3E1DD, 라운드 large.
    private var allConsentRow: some View {
        Button { viewModel.toggleAll() } label: {
            HStack(spacing: ChalkakSpacing.lg) {
                ChalkakCheckbox(isChecked: viewModel.agreedToAll)
                Text(OnboardingCopy.termsAgreeAll)
                    .font(ChalkakFont.body)
                    .foregroundStyle(ChalkakColor.textPrimary)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, ChalkakSpacing.lg)
            .padding(.vertical, 19)
            .background(ChalkakColor.inputBackground, in: RoundedRectangle(cornerRadius: ChalkakRadius.large))
            .overlay(RoundedRectangle(cornerRadius: ChalkakRadius.large).stroke(Color(hex: 0xE3E1DD), lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: ChalkakRadius.large))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(viewModel.agreedToAll ? [.isSelected] : [])
        .accessibilityValue(viewModel.agreedToAll ? "checked" : "unchecked")
        .accessibilityIdentifier("terms.agree-all-checkbox")
    }

    /// 필수 행: 체크박스 + body(textPrimary 85%), 간격 14, 오른쪽 "보기" callout/textMuted.
    private func requiredRow(
        title: String, isOn: Bool, checkIdentifier: String, viewIdentifier: String,
        toggle: @escaping () -> Void, view: @escaping () -> Void
    ) -> some View {
        HStack(spacing: 0) {
            Button(action: toggle) {
                HStack(spacing: 14) {
                    ChalkakCheckbox(isChecked: isOn)
                    Text(title)
                        .font(ChalkakFont.body)
                        .foregroundStyle(ChalkakColor.textPrimary.opacity(0.85))
                    Spacer(minLength: 0)
                }
                .padding(.leading, ChalkakSpacing.xs)
                .padding(.vertical, ChalkakSpacing.lg)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(isOn ? [.isSelected] : [])
            .accessibilityValue(isOn ? "checked" : "unchecked")
            .accessibilityIdentifier(checkIdentifier)

            Button(action: view) {
                Text(OnboardingCopy.termsView)
                    .font(ChalkakFont.callout)
                    .foregroundStyle(ChalkakColor.textMuted)
                    .padding(.leading, ChalkakSpacing.md)
                    .padding(.trailing, ChalkakSpacing.xs)
                    .padding(.vertical, ChalkakSpacing.lg)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier(viewIdentifier)
        }
    }
}
