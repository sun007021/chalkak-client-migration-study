// ignore_for_file: unused_field
import 'package:flutter/foundation.dart';

import '../../../core/analytics/analytics_tracker.dart';
import '../../../core/ui/toast/toast_controller.dart';
import 'banner_web_policy.dart';
import 'external_link_launcher.dart';

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
/// - [onNavigationRequest]: 정책으로 판정하고 openExternal이면 [ExternalLinkLauncher]로 연다.
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
  final ExternalLinkLauncher _launcher;

  Uri get url => throw UnimplementedError();
  BannerWebState get state => throw UnimplementedError();

  void start() => throw UnimplementedError();
  void onLoadFinished() => throw UnimplementedError();
  void onLoadFailed() => throw UnimplementedError();
  void retry() => throw UnimplementedError();

  Future<NavigationDecision> onNavigationRequest(
    WebNavigationRequest request,
  ) => throw UnimplementedError();
}
