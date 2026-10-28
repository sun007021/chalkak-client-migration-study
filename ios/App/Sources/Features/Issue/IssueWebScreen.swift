import SwiftUI
import WebKit
import ChalkakFeatures

/// 배너 웹뷰 화면. 링크 정책·상태는 `IssueWebViewModel`(→ `IssueWebNavigationPolicy`)이 정하고 여기서는 WKNavigationAction을 옮기고 그린다.
struct IssueWebScreen: View {
    let container: AppContainer
    let onBack: () -> Void
    @State private var viewModel: IssueWebViewModel

    init(container: AppContainer, url: URL, onBack: @escaping () -> Void) {
        self.container = container
        self.onBack = onBack
        _viewModel = State(initialValue: container.makeIssueWebViewModel(url: url))
    }

    var body: some View {
        VStack(spacing: 0) {
            ChalkakNavBar(title: viewModel.title, backIdentifier: "issue.back-button", titleIdentifier: "issue.title", onBack: onBack)
            ZStack {
                if let url = viewModel.loadURL {
                    ChalkakWebView(
                        url: url,
                        reloadToken: viewModel.reloadToken,
                        decide: { action, webView in decide(action, webView) },
                        onFinished: { viewModel.pageLoadFinished() },
                        onFailed: { viewModel.pageLoadFailed() }
                    )
                    .accessibilityIdentifier("issue.web-content")
                }
                overlay
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(ChalkakColor.background.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("issue.root")
        .onAppear { viewModel.appeared() }
    }

    @ViewBuilder
    private var overlay: some View {
        switch viewModel.state {
        case .loading:
            ProgressView().accessibilityIdentifier("issue.loading")
        case .loaded:
            EmptyView()
        case .failed(let message):
            VStack(spacing: ChalkakSpacing.md) {
                Text(message)
                    .font(ChalkakFont.callout)
                    .foregroundStyle(ChalkakColor.textSecondary)
                Button { viewModel.retry() } label: {
                    Text(BannerCopy.retry)
                        .font(ChalkakFont.callout)
                        .foregroundStyle(ChalkakColor.onActionPrimary)
                        .padding(.horizontal, ChalkakSpacing.xl)
                        .frame(minHeight: 44)
                        .background(ChalkakColor.actionPrimary, in: RoundedRectangle(cornerRadius: ChalkakRadius.button))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("issue.retry-button")
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(ChalkakColor.background)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("issue.error-state")
        case .unsafeLink(let message):
            Text(message)
                .font(ChalkakFont.callout)
                .foregroundStyle(ChalkakColor.textSecondary)
                .accessibilityIdentifier("issue.link-open-failed-message")
        }
    }

    private func decide(_ action: WKNavigationAction, _ webView: WKWebView) -> WKNavigationActionPolicy {
        // WKWebView targetFrame == nil(새 창/탭을 여는 이동)은 메인 프레임 + 새 창으로 옮긴다(IssueWebNavigation 계약).
        let navigation = IssueWebNavigation(
            url: action.request.url,
            currentURL: webView.url,
            isMainFrame: action.targetFrame?.isMainFrame ?? true,
            isUserInitiated: action.navigationType == .linkActivated,
            opensNewWindow: action.targetFrame == nil
        )
        switch viewModel.decide(navigation) {
        case .allow:
            return .allow
        case .block:
            return .cancel
        case .openExternal:
            if let url = action.request.url { openExternally(url) }
            return .cancel
        }
    }

    private func openExternally(_ url: URL) {
        let viewModel = viewModel
        let opener = container.externalOpener
        Task { @MainActor in
            let outcome = await opener.outcome(for: url)
            viewModel.externalOpenFinished(outcome)
        }
    }
}
