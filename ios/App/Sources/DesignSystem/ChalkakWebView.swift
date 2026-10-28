import SwiftUI
import WebKit

/// WKWebView 얇은 래퍼. 이동 허용 여부는 호출자가 정하고(`decide`), 이 뷰는 주소 로드·다시 로드·결과 전달만 한다.
/// `reloadToken`이 바뀌면 같은 주소를 다시 로드한다.
struct ChalkakWebView: UIViewRepresentable {
    let url: URL
    let reloadToken: Int
    let decide: (WKNavigationAction, WKWebView) -> WKNavigationActionPolicy
    let onFinished: () -> Void
    let onFailed: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self, lastReloadToken: reloadToken)
    }

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.parent = self
        guard context.coordinator.lastReloadToken != reloadToken else { return }
        context.coordinator.lastReloadToken = reloadToken
        webView.load(URLRequest(url: url))
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.stopLoading()
        webView.navigationDelegate = nil
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        var parent: ChalkakWebView
        var lastReloadToken: Int

        init(parent: ChalkakWebView, lastReloadToken: Int) {
            self.parent = parent
            self.lastReloadToken = lastReloadToken
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
            parent.decide(navigationAction, webView)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            parent.onFinished()
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            handle(error)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            handle(error)
        }

        private func handle(_ error: Error) {
            // 우리가 취소한 이동(정책 차단, 새 로드)은 실패가 아니다.
            guard (error as NSError).code != NSURLErrorCancelled else { return }
            parent.onFailed()
        }
    }
}
