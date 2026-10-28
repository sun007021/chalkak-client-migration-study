import 'banner_web_policy.dart';

/// 배너 웹뷰의 현재 주소와 "최초 로드 구간"을 추적해 이동 요청을 [WebNavigationRequest]로 만든다
/// (REQ-BANR-014~016, 018). 웹뷰 플러그인은 제스처 여부를 주지 않으므로 다음과 같이 판정한다.
/// - 로드를 시작한 뒤 첫 [onPageFinished]/[onLoadFailed] 전의 메인 프레임 이동(서버 리다이렉트 포함)은
///   모두 최초 로드로 본다.
/// - 그 뒤의 메인 프레임 이동은 사용자 이동으로 보고, 하위 프레임 이동은 사용자 이동 여부와 무관하다.
/// - 앵커 판정에 쓰는 현재 주소는 [onPageStarted]/[onUrlChange]가 알려 준 실제 주소다.
class BannerWebNavigationTracker {
  BannerWebNavigationTracker(this.initialUrl) : _currentUrl = initialUrl;

  final Uri initialUrl;
  Uri _currentUrl;
  bool _initialPhase = true;

  Uri get currentUrl => _currentUrl;
  bool get isInitialPhase => _initialPhase;

  void onPageStarted(Uri url) => _currentUrl = url;

  void onUrlChange(Uri url) => _currentUrl = url;

  void onPageFinished(Uri url) {
    _currentUrl = url;
    _initialPhase = false;
  }

  /// 메인 프레임 로드 실패. 이후 이동은 최초 로드가 아니다(다시 시도는 [restart]).
  void onLoadFailed() => _initialPhase = false;

  /// 다시 시도: 처음 주소를 새로 최초 로드한다.
  void restart() {
    _currentUrl = initialUrl;
    _initialPhase = true;
  }

  WebNavigationRequest requestFor(Uri url, {required bool isMainFrame}) {
    final initial = _initialPhase && isMainFrame;
    return WebNavigationRequest(
      url: url,
      isMainFrame: isMainFrame,
      isUserInitiated: isMainFrame && !_initialPhase,
      isInitialLoad: initial,
      currentUrl: _currentUrl,
    );
  }
}
