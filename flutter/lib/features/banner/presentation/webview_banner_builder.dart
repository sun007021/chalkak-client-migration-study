import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart' as wv;

import '../../../core/ui/test_id.dart';
import '../domain/banner_web_navigation_tracker.dart';
import '../domain/banner_web_policy.dart';
import 'banner_test_ids.dart';
import 'banner_web_view_builder.dart';

/// 실제 웹뷰([BannerWebViewBuilder]의 기본 구현). 빌더가 만든 위젯 루트에 `issue.web-content`를 단다.
/// 이동 판정은 [BannerWebViewHost.onNavigationRequest]에 맡긴다. 현재 주소와 최초 로드 구간은
/// [BannerWebNavigationTracker]가 추적한다.
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
  late final BannerWebNavigationTracker _tracker = BannerWebNavigationTracker(
    widget.host.initialUrl,
  );
  late final wv.WebViewController _controller = wv.WebViewController()
    ..setJavaScriptMode(wv.JavaScriptMode.unrestricted)
    ..setNavigationDelegate(
      wv.NavigationDelegate(
        onNavigationRequest: _onRequest,
        onPageStarted: (url) => _tracker.onPageStarted(Uri.parse(url)),
        onUrlChange: (change) {
          final url = change.url;
          if (url != null) _tracker.onUrlChange(Uri.parse(url));
        },
        onPageFinished: (url) {
          _tracker.onPageFinished(Uri.parse(url));
          if (mounted) widget.host.onLoadFinished();
        },
        onWebResourceError: (error) {
          if (error.isForMainFrame ?? true) {
            _tracker.onLoadFailed();
            if (mounted) widget.host.onLoadFailed();
          }
        },
      ),
    )
    ..loadRequest(widget.host.initialUrl);

  Future<wv.NavigationDecision> _onRequest(wv.NavigationRequest request) async {
    final decision = await widget.host.onNavigationRequest(
      _tracker.requestFor(
        Uri.parse(request.url),
        isMainFrame: request.isMainFrame,
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
      _tracker.restart();
      _controller.loadRequest(widget.host.initialUrl);
    }
  }

  @override
  Widget build(BuildContext context) => TestId(
    BannerTestIds.issueWebContent,
    child: wv.WebViewWidget(controller: _controller),
  );
}
