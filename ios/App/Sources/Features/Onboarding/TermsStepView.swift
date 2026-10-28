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
        VStack(alignment: .leading, spacing: 0) {
            Button { viewModel.backTapped() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(ChalkakColor.iconPrimary)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("terms.back-button")

            Text(OnboardingCopy.termsTitle)
                .font(ChalkakFont.display)
                .foregroundStyle(ChalkakColor.textPrimary)
                .padding(.top, ChalkakSpacing.xl)
                .accessibilityIdentifier("terms.title")

            VStack(alignment: .leading, spacing: ChalkakSpacing.lg) {
                checkRow(
                    title: OnboardingCopy.termsAgreeAll, isOn: viewModel.agreedToAll,
                    checkIdentifier: "terms.agree-all-checkbox", viewIdentifier: nil,
                    toggle: { viewModel.toggleAll() }, view: nil
                )
                Divider()
                checkRow(
                    title: OnboardingCopy.termsService, isOn: viewModel.agreedToService,
                    checkIdentifier: "terms.service-checkbox", viewIdentifier: "terms.service-view-button",
                    toggle: { viewModel.toggleService() },
                    view: { Task { await viewModel.viewDocument(.service) } }
                )
                checkRow(
                    title: OnboardingCopy.termsPrivacy, isOn: viewModel.agreedToPrivacy,
                    checkIdentifier: "terms.privacy-checkbox", viewIdentifier: "terms.privacy-view-button",
                    toggle: { viewModel.togglePrivacy() },
                    view: { Task { await viewModel.viewDocument(.privacy) } }
                )
            }
            .padding(.top, 48)

            Spacer(minLength: 0)

            Button { viewModel.nextTapped() } label: {
                Text(OnboardingCopy.termsNext)
                    .font(ChalkakFont.callout)
                    .foregroundStyle(ChalkakColor.onActionPrimary)
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .background(ChalkakColor.actionPrimary, in: RoundedRectangle(cornerRadius: ChalkakRadius.button))
                    .opacity(viewModel.canProceed ? 1 : 0.3)
            }
            .buttonStyle(.plain)
            .disabled(!viewModel.canProceed)
            .accessibilityIdentifier("terms.next-button")
        }
        .padding(.horizontal, ChalkakSpacing.screenHorizontal)
        .padding(.bottom, ChalkakSpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(ChalkakColor.background.ignoresSafeArea())
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

    private func checkRow(
        title: String, isOn: Bool, checkIdentifier: String, viewIdentifier: String?,
        toggle: @escaping () -> Void, view: (() -> Void)?
    ) -> some View {
        HStack(spacing: ChalkakSpacing.md) {
            Button(action: toggle) {
                HStack(spacing: ChalkakSpacing.md) {
                    Image(isOn ? "ic_checkbox_selected" : "ic_checkbox_unselected")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 24, height: 24)
                    Text(title)
                        .font(ChalkakFont.callout)
                        .foregroundStyle(ChalkakColor.textPrimary)
                    Spacer(minLength: 0)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(isOn ? [.isSelected] : [])
            .accessibilityValue(isOn ? "checked" : "unchecked")
            .accessibilityIdentifier(checkIdentifier)

            if let view, let viewIdentifier {
                Button(action: view) {
                    Text(OnboardingCopy.termsView)
                        .font(ChalkakFont.subheadline)
                        .foregroundStyle(ChalkakColor.textSecondary)
                        .underline()
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier(viewIdentifier)
            }
        }
    }
}
