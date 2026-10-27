import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../domain/legal_document.dart';

/// 약관 문서를 앱 안에서 보여 주는 실제 웹뷰([LegalWebViewBuilder]의 기본 구현).
/// - 처음 [url]을 불러오고, [reloadCount]가 늘면 같은 주소를 다시 불러온다.
/// - 문서 안 링크가 허용 호스트(`LegalLinkPolicy`) 밖이면 이동을 막는다.
/// - 메인 프레임 로드가 끝나면 [onLoaded], 실패하면 [onError]를 부른다.
class LegalWebView extends StatefulWidget {
  const LegalWebView({
    super.key,
    required this.url,
    required this.reloadCount,
    required this.onLoaded,
    required this.onError,
  });

  /// [LegalWebViewBuilder] 모양으로 쓰는 팩토리.
  static Widget build(
    BuildContext context, {
    required Uri url,
    required int reloadCount,
    required VoidCallback onLoaded,
    required VoidCallback onError,
  }) => LegalWebView(
    url: url,
    reloadCount: reloadCount,
    onLoaded: onLoaded,
    onError: onError,
  );

  final Uri url;
  final int reloadCount;
  final VoidCallback onLoaded;
  final VoidCallback onError;

  @override
  State<LegalWebView> createState() => _LegalWebViewState();
}

class _LegalWebViewState extends State<LegalWebView> {
  late final WebViewController _controller = WebViewController()
    ..setJavaScriptMode(JavaScriptMode.unrestricted)
    ..setNavigationDelegate(
      NavigationDelegate(
        onNavigationRequest: (request) =>
            LegalLinkPolicy.decide(request.url) == LegalLinkTarget.inApp
            ? NavigationDecision.navigate
            : NavigationDecision.prevent,
        onPageFinished: (_) => widget.onLoaded(),
        onWebResourceError: (error) {
          if (error.isForMainFrame ?? true) widget.onError();
        },
      ),
    )
    ..loadRequest(widget.url);

  @override
  void didUpdateWidget(LegalWebView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.reloadCount != widget.reloadCount) {
      _controller.loadRequest(widget.url);
    }
  }

  @override
  Widget build(BuildContext context) => WebViewWidget(controller: _controller);
}
