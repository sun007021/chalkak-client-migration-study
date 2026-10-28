import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart' as wv;

import '../../../core/ui/test_id.dart';
import '../domain/banner_web_policy.dart';
import 'banner_test_ids.dart';
import 'banner_web_view_builder.dart';

/// 실제 웹뷰([BannerWebViewBuilder]의 기본 구현). 빌더가 만든 위젯 루트에 `issue.web-content`를 단다.
/// 이동 판정은 [BannerWebViewHost.onNavigationRequest]에 맡긴다. 플러그인은 제스처 여부를
/// 알려 주지 않으므로 최초 로드(처음·다시 시도) 이후의 메인 프레임 이동은 사용자 이동으로 본다.
class WebViewBannerBuilder implements BannerWebViewBuilder {
  const WebViewBannerBuilder();

  @override
  Widget build(BuildContext context, BannerWebViewHost host) =>
      _BannerWebView(host: host);
}

class _BannerWebView extends StatefulWidget {
  const _BannerWebView({required this.host});

  final BannerWebViewHost host;

  @override
  State<_BannerWebView> createState() => _BannerWebViewState();
}

class _BannerWebViewState extends State<_BannerWebView> {
  bool _initialPending = true;
  late final wv.WebViewController _controller = wv.WebViewController()
    ..setJavaScriptMode(wv.JavaScriptMode.unrestricted)
    ..setNavigationDelegate(
      wv.NavigationDelegate(
        onNavigationRequest: _onRequest,
        onPageFinished: (_) {
          if (mounted) widget.host.onLoadFinished();
        },
        onWebResourceError: (error) {
          if (mounted && (error.isForMainFrame ?? true)) {
            widget.host.onLoadFailed();
          }
        },
      ),
    )
    ..loadRequest(widget.host.initialUrl);

  Future<wv.NavigationDecision> _onRequest(wv.NavigationRequest request) async {
    final initial = _initialPending;
    _initialPending = false;
    final decision = await widget.host.onNavigationRequest(
      WebNavigationRequest(
        url: Uri.parse(request.url),
        isMainFrame: request.isMainFrame,
        isUserInitiated: !initial,
        isInitialLoad: initial,
        currentUrl: widget.host.initialUrl,
      ),
    );
    return decision == NavigationDecision.allowInApp
        ? wv.NavigationDecision.navigate
        : wv.NavigationDecision.prevent;
  }

  @override
  void didUpdateWidget(_BannerWebView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.host.reloadToken != widget.host.reloadToken) {
      _initialPending = true;
      _controller.loadRequest(widget.host.initialUrl);
    }
  }

  @override
  Widget build(BuildContext context) => TestId(
    BannerTestIds.issueWebContent,
    child: wv.WebViewWidget(controller: _controller),
  );
}
