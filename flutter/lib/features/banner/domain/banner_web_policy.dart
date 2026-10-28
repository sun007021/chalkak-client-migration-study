/// 웹뷰가 한 이동 요청을 어떻게 처리할지(REQ-BANR-014~018).
enum NavigationDecision {
  /// 웹뷰 안에서 그대로 진행.
  allowInApp,

  /// 진행하지 않는다.
  block,

  /// 시스템 브라우저로 연다(앱 안에서는 이동하지 않는다).
  openExternal,
}

/// 웹뷰 플러그인이 알려 주는 이동 요청. 플랫폼 구현이 이 값으로 바꿔 넘긴다.
class WebNavigationRequest {
  const WebNavigationRequest({
    required this.url,
    this.isMainFrame = true,
    this.isUserInitiated = false,
    this.isNewWindow = false,
    this.isInitialLoad = false,
    this.currentUrl,
  });

  final Uri url;

  /// false면 하위 프레임(iframe) 이동.
  final bool isMainFrame;

  /// 사용자 제스처(탭)로 시작됐는지.
  final bool isUserInitiated;

  /// 새 창/새 탭(`target=_blank`, window.open) 요청인지.
  final bool isNewWindow;

  /// 배너를 열 때의 최초 로드인지.
  final bool isInitialLoad;

  /// 지금 보이는 문서 주소(앵커 이동 판정용).
  final Uri? currentUrl;
}

/// 배너 웹뷰 이동 정책(순수 함수).
abstract final class BannerWebNavigationPolicy {
  /// 규칙:
  /// - 최초 로드: https이고 호스트가 있으면 allowInApp, 아니면 block.
  /// - 하위 프레임 이동: allowInApp(앱 밖으로 열지 않음).
  /// - 사용자 제스처 없는 자동 이동·새 창: block.
  /// - 사용자가 누른 http(s) 링크(새 탭, 같은 호스트·같은 URL 포함): openExternal.
  /// - 같은 문서 안 앵커(`#...`) 이동: allowInApp. 새 탭 앵커는 openExternal.
  /// - 그 밖의 스킴(`tel:`, `mailto:`, `intent:`, `javascript:`, `file:`, 커스텀): block.
  static NavigationDecision decide(WebNavigationRequest request) {
    final url = request.url;
    if (request.isInitialLoad) {
      return isLoadable(url)
          ? NavigationDecision.allowInApp
          : NavigationDecision.block;
    }
    if (!request.isMainFrame) return NavigationDecision.allowInApp;
    if (!_isWebScheme(url) || !request.isUserInitiated) {
      return NavigationDecision.block;
    }
    if (!request.isNewWindow &&
        _isSameDocumentAnchor(url, request.currentUrl)) {
      return NavigationDecision.allowInApp;
    }
    return NavigationDecision.openExternal;
  }

  /// 배너 `webViewUrl`을 웹뷰에 로드해도 되는지(https + 호스트 있음).
  static bool isLoadable(Uri url) =>
      url.scheme == 'https' && url.host.isNotEmpty;

  static bool _isWebScheme(Uri url) =>
      (url.scheme == 'https' || url.scheme == 'http') && url.host.isNotEmpty;

  static bool _isSameDocumentAnchor(Uri url, Uri? current) =>
      current != null &&
      url.hasFragment &&
      url.removeFragment() == current.removeFragment();
}
