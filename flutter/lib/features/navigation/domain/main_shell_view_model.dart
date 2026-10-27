// ignore_for_file: unused_field
import 'package:flutter/foundation.dart';

import '../../../core/analytics/analytics_constants.dart';
import '../../../core/analytics/analytics_tracker.dart';
import '../../../core/time/kst_date.dart';
import '../../../core/ui/toast/toast_controller.dart';
import 'guest_guard.dart';
import 'upload_entry_gate.dart';

/// 기록 탭이 열릴 때 선택할 날짜(홈 이번 주 칸). 기록 PR이 [MainShellViewModel.takeRecordTarget]으로 받는다.
class RecordTarget {
  const RecordTarget(this.date);
  final KstDate date;
}

/// 전시 탭이 열릴 때 보여 줄 날짜와 정렬(홈 랭킹 더보기).
class DisplayTarget {
  const DisplayTarget({required this.date, required this.popular});
  final KstDate date;
  final bool popular;
}

sealed class MainShellEvent {
  const MainShellEvent();
}

/// 해당 탭 루트를 맨 위로 스크롤한다(홈 선택/재선택, 전시 재선택).
final class ScrollToTop extends MainShellEvent {
  const ScrollToTop(this.destination);
  final BottomDestination destination;
}

/// 게이트 통과. 업로드 화면으로 [topicDate]를 고정해 간다.
final class NavigateToUpload extends MainShellEvent {
  const NavigateToUpload(this.topicDate);
  final KstDate topicDate;
}

/// 게이트 401. 로그인 화면으로.
final class NavigateToLogin extends MainShellEvent {
  const NavigateToLogin();
}

/// 메인 셸 상태(REQ-NAV-001~020, 035~036, TC-NAV-003~009, 016~017).
/// - 시작은 홈 탭. [start]가 `screen_view home`을 보낸다.
/// - [selectTab]: 게스트의 기록 탭은 탭 변경 없이 GuestRestriction.record 토스트(API 0건).
///   다른 탭으로 바뀌면 `bottom_navigation_selected {destination}`와 해당 `screen_view`를 보낸다.
///   같은 탭 재선택은 `bottom_navigation_selected`만 보내고(screen_view 없음) 전시·홈이면
///   [ScrollToTop]을 낸다. 다른 탭에서 홈으로 오면 [ScrollToTop](home)도 낸다(REQ-NAV-004).
/// - [onUploadPressed]: 게스트면 GuestRestriction.upload 토스트(게이트 호출 0건), 아니면
///   [UploadEntryGate.enter]. 확인 중([isCheckingUpload])의 연타는 무시해 1회만 호출한다.
///   결과: Allowed -> [NavigateToUpload], Blocked -> 토스트, LoginRequired -> [NavigateToLogin].
///   선택된 탭 표시와 `bottom_navigation_selected`는 바뀌지 않는다.
class MainShellViewModel extends ChangeNotifier {
  MainShellViewModel({
    required this._guard,
    required this._analytics,
    required this._uploadGate,
    required this._toast,
  });

  final GuestGuard _guard;
  final AnalyticsTracker _analytics;
  final UploadEntryGate _uploadGate;
  final ToastSink _toast;

  BottomDestination get selected => throw UnimplementedError();
  bool get isCheckingUpload => throw UnimplementedError();
  Stream<MainShellEvent> get events => throw UnimplementedError();

  RecordTarget? get recordTarget => throw UnimplementedError();
  DisplayTarget? get displayTarget => throw UnimplementedError();

  void start() => throw UnimplementedError();
  void selectTab(BottomDestination destination) => throw UnimplementedError();
  Future<void> onUploadPressed() => throw UnimplementedError();

  /// 홈에서 기록 탭으로(이번 주 칸/보러가기). [date]가 있으면 [recordTarget]에 둔다.
  /// 게스트 제한은 [selectTab]과 같다.
  void openRecord({KstDate? date}) => throw UnimplementedError();

  /// 홈에서 전시 탭으로(랭킹 더보기). [displayTarget]에 둔다.
  void openDisplay({required KstDate date, required bool popular}) =>
      throw UnimplementedError();

  RecordTarget? takeRecordTarget() => throw UnimplementedError();
  DisplayTarget? takeDisplayTarget() => throw UnimplementedError();
}
