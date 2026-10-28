import SwiftUI
import WebKit
import ChalkakFeatures

/// 약관 문서를 앱 안에서 보여 주는 시트(가입·설정 공용). 어디서 열지(앱 안/외부)는 `TermsViewModel`·`LegalDocumentRouting`이 이미 정했다.
struct LegalDocumentSheet: View {
    enum LoadState {
        case loading
        case loaded
        case failed
    }

    let container: AppContainer
    let presentation: TermsDocumentPresentation
    let onClose: () -> Void
    @State private var loadState: LoadState = .loading
    @State private var reloadToken = 0

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Text(presentation.title)
                    .font(ChalkakFont.headline)
                    .foregroundStyle(ChalkakColor.textPrimary)
                    .accessibilityIdentifier("legal-doc.title")
                HStack {
                    Spacer(minLength: 0)
                    Button(action: onClose) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(ChalkakColor.iconPrimary)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("legal-doc.close-button")
                }
            }
            .padding(.horizontal, ChalkakSpacing.sm)
            .frame(height: 52)

            ZStack {
                ChalkakWebView(
                    url: presentation.url,
                    reloadToken: reloadToken,
                    decide: { action, _ in decide(action) },
                    onFinished: { loadState = .loaded },
                    onFailed: { loadState = .failed }
                )
                .accessibilityIdentifier("legal-doc.web-content")
                switch loadState {
                case .loading:
                    ProgressView().accessibilityIdentifier("legal-doc.loading")
                case .loaded:
                    EmptyView()
                case .failed:
                    VStack(spacing: ChalkakSpacing.md) {
                        Text(OnboardingCopy.termsDocError)
                            .font(ChalkakFont.callout)
                            .foregroundStyle(ChalkakColor.textSecondary)
                        Button {
                            loadState = .loading
                            reloadToken += 1
                        } label: {
                            Text(OnboardingCopy.termsDocRetry)
                                .font(ChalkakFont.callout)
                                .foregroundStyle(ChalkakColor.onActionPrimary)
                                .padding(.horizontal, ChalkakSpacing.xl)
                                .frame(minHeight: 44)
                                .background(ChalkakColor.actionPrimary, in: RoundedRectangle(cornerRadius: ChalkakRadius.button))
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("legal-doc.retry-button")
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(ChalkakColor.background)
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("legal-doc.error-state")
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(ChalkakColor.background.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("legal-doc.sheet")
    }

    /// 사용자가 누른 링크만 판정한다: 허용 호스트(https)면 그대로, 그 밖의 http(s)는 외부 브라우저, 열 수 없는 주소는 막는다.
    private func decide(_ action: WKNavigationAction) -> WKNavigationActionPolicy {
        guard action.navigationType == .linkActivated, let url = action.request.url else { return .allow }
        switch LegalDocumentRouting.route(for: url.absoluteString) {
        case .inApp:
            return .allow
        case .external(let external):
            let opener = container.externalOpener
            Task { _ = await opener.open(external) }
            return .cancel
        case .unopenable:
            return .cancel
        }
    }
}
