import 'package:flutter/foundation.dart';

import '../../../core/analytics/analytics_constants.dart';
import '../../../core/analytics/analytics_tracker.dart';
import '../../../core/copy/ko.g.dart';
import '../../../core/ui/toast/toast_controller.dart';
import 'banner_link_launcher.dart';
import 'banner_web_policy.dart';

enum BannerWebStatus {
  /// 최초 로드·다시 시도 중.
  loading,

  /// 로드 완료.
  shown,

  /// 로드 실패. "페이지를 불러오지 못했어요" + 다시 시도.
  loadError,

  /// 안전하지 않은 주소(https 아님/호스트 없음). 로드하지 않고 "링크를 열 수 없어요".
  unsafeUrl,
}

class BannerWebState {
  const BannerWebState({required this.status, this.reloadToken = 0});

  final BannerWebStatus status;

  /// 다시 시도할 때마다 1씩 늘어난다. 화면은 값이 바뀌면 같은 주소를 다시 로드한다.
  final int reloadToken;
}

/// 배너 웹뷰 화면의 상태(REQ-BANR-012~020).
/// - [start]: `screen_view issue`를 한 번만 보낸다(여러 번 불러도 1회).
///   주소가 [BannerWebNavigationPolicy.isLoadable]이 아니면 unsafeUrl로 두고 로드하지 않는다.
/// - [onLoadFinished]/[onLoadFailed]/[retry]: loading -> shown/loadError, retry는 reloadToken 증가.
/// - [onNavigationRequest]: 정책으로 판정하고 openExternal이면 [BannerLinkLauncher]로 연다.
///   noBrowser면 토스트 "링크를 열 수 있는 브라우저가 없어요", failed면
///   "브라우저에서 링크를 열지 못했어요". block은 아무 일도 없다.
class BannerWebViewModel extends ChangeNotifier {
  BannerWebViewModel({
    required this._url,
    required this._analytics,
    required this._toast,
    required this._launcher,
  });

  final Uri _url;
  final AnalyticsTracker _analytics;
  final ToastSink _toast;
  final BannerLinkLauncher _launcher;

  BannerWebState _state = const BannerWebState(status: BannerWebStatus.loading);
  bool _started = false;
  bool _disposed = false;

  Uri get url => _url;
  BannerWebState get state => _state;

  void start() {
    if (_started) return;
    _started = true;
    _analytics.logEvent(AnalyticsEvent.screenView(ScreenNames.issue));
    if (!BannerWebNavigationPolicy.isLoadable(_url)) {
      _setState(const BannerWebState(status: BannerWebStatus.unsafeUrl));
    }
  }

  void onLoadFinished() => _settle(BannerWebStatus.shown);

  void onLoadFailed() => _settle(BannerWebStatus.loadError);

  void retry() {
    if (_state.status != BannerWebStatus.loadError) return;
    _setState(
      BannerWebState(
        status: BannerWebStatus.loading,
        reloadToken: _state.reloadToken + 1,
      ),
    );
  }

  Future<NavigationDecision> onNavigationRequest(
    WebNavigationRequest request,
  ) async {
    final decision = BannerWebNavigationPolicy.decide(request);
    if (decision == NavigationDecision.openExternal) {
      await _openExternal(request.url);
    }
    return decision;
  }

  Future<void> _openExternal(Uri url) async {
    BannerLaunchResult result;
    try {
      result = await _launcher.open(url);
    } on Object {
      // 플랫폼 오류도 사용자에게는 "열지 못했다"로 같다.
      result = BannerLaunchResult.failed;
    }
    if (_disposed) return;
    switch (result) {
      case BannerLaunchResult.opened:
        break;
      case BannerLaunchResult.noBrowser:
        _toast.show(Copy.bannerWebNoBrowser);
      case BannerLaunchResult.failed:
        _toast.show(Copy.bannerWebOpenFailed);
    }
  }

  /// 안전하지 않은 주소나 이미 오류인 화면은 늦게 온 로드 콜백으로 바뀌지 않는다.
  void _settle(BannerWebStatus status) {
    final current = _state.status;
    if (current == BannerWebStatus.unsafeUrl) return;
    if (current == BannerWebStatus.loadError &&
        status == BannerWebStatus.shown) {
      // 오류 뒤 다시 시도 전에는 성공으로 덮지 않는다.
      return;
    }
    _setState(BannerWebState(status: status, reloadToken: _state.reloadToken));
  }

  void _setState(BannerWebState next) {
    if (_disposed) return;
    _state = next;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
