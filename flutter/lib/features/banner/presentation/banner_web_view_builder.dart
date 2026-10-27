import 'package:flutter/widgets.dart';

import '../domain/banner_web_policy.dart';

/// 웹뷰 본문이 알아야 하는 값과 콜백. 플랫폼 웹뷰는 이것만 보고 만든다.
class BannerWebViewHost {
  const BannerWebViewHost({
    required this.initialUrl,
    required this.reloadToken,
    required this.onNavigationRequest,
    required this.onLoadFinished,
    required this.onLoadFailed,
  });

  final Uri initialUrl;

  /// 값이 바뀌면 [initialUrl]을 다시 로드한다.
  final int reloadToken;
  final Future<NavigationDecision> Function(WebNavigationRequest request)
  onNavigationRequest;
  final VoidCallback onLoadFinished;
  final VoidCallback onLoadFailed;
}

/// 앱 안 웹뷰를 만드는 주입형 빌더. 실제 구현(webview_flutter)은 앱 조립 시 주입하고,
/// 테스트는 Fake 빌더를 넣는다. 빌더가 만든 위젯 루트에 `issue.web-content`를 단다.
abstract interface class BannerWebViewBuilder {
  Widget build(BuildContext context, BannerWebViewHost host);
}
