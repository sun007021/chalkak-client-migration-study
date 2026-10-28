import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../core/analytics/analytics_constants.dart';
import '../../../core/analytics/analytics_tracker.dart';
import '../../../core/copy/ko.g.dart';
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
  const DisplayTarget({
    required this.date,
    required this.popular,
    this.revalidate = false,
  });
  final KstDate date;
  final bool popular;

  /// 이미 그 날짜를 보고 있어도 목록을 다시 불러온다(업로드 직후 REQ-UPL-063).
  final bool revalidate;
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

  final StreamController<MainShellEvent> _events =
      StreamController<MainShellEvent>.broadcast();
  final CancelToken _cancelToken = CancelToken();

  BottomDestination _selected = BottomDestination.home;
  bool _isCheckingUpload = false;
  bool _started = false;
  bool _disposed = false;
  RecordTarget? _recordTarget;
  DisplayTarget? _displayTarget;

  BottomDestination get selected => _selected;
  bool get isCheckingUpload => _isCheckingUpload;
  Stream<MainShellEvent> get events => _events.stream;

  RecordTarget? get recordTarget => _recordTarget;
  DisplayTarget? get displayTarget => _displayTarget;

  void start() {
    if (_started) return;
    _started = true;
    _logScreen(_selected);
  }

  void selectTab(BottomDestination destination) {
    if (_disposed) return;
    if (destination == BottomDestination.record &&
        _guard.blocks(GuestRestriction.record)) {
      return;
    }
    _analytics.logEvent(AnalyticsEvent.bottomNavigationSelected(destination));
    final reselected = destination == _selected;
    if (!reselected) {
      _selected = destination;
      _logScreen(destination);
      notifyListeners();
    }
    // 홈은 올 때마다 초기 상태(REQ-NAV-004), 전시는 재선택만(REQ-NAV-007).
    final scrollsToTop =
        destination == BottomDestination.home ||
        (reselected && destination == BottomDestination.display);
    if (scrollsToTop) _emit(ScrollToTop(destination));
  }

  Future<void> onUploadPressed() async {
    if (_disposed || _isCheckingUpload) return;
    if (_guard.blocks(GuestRestriction.upload)) return;
    _isCheckingUpload = true;
    notifyListeners();
    UploadGateResult result;
    try {
      result = await _uploadGate.enter(cancelToken: _cancelToken);
    } on Object {
      result = const UploadGateBlocked(Copy.uploadGateCheckFailed);
    }
    if (_disposed) return;
    _isCheckingUpload = false;
    notifyListeners();
    switch (result) {
      case UploadGateAllowed(:final topicDate):
        _emit(NavigateToUpload(topicDate));
      case UploadGateBlocked(:final message):
        _toast.show(message);
      case UploadGateLoginRequired():
        _emit(const NavigateToLogin());
      case UploadGateCancelled():
        break;
    }
  }

  /// 홈에서 기록 탭으로(이번 주 칸/보러가기). [date]가 있으면 [recordTarget]에 둔다.
  /// 게스트 제한은 [selectTab]과 같다.
  void openRecord({KstDate? date}) {
    if (_guard.isGuest) {
      _guard.blocks(GuestRestriction.record);
      return;
    }
    _recordTarget = date == null ? null : RecordTarget(date);
    selectTab(BottomDestination.record);
  }

  /// 홈에서 전시 탭으로(랭킹 더보기). [displayTarget]에 둔다.
  void openDisplay({
    required KstDate date,
    required bool popular,
    bool revalidate = false,
  }) {
    _displayTarget = DisplayTarget(
      date: date,
      popular: popular,
      revalidate: revalidate,
    );
    selectTab(BottomDestination.display);
  }

  RecordTarget? takeRecordTarget() {
    final target = _recordTarget;
    _recordTarget = null;
    return target;
  }

  DisplayTarget? takeDisplayTarget() {
    final target = _displayTarget;
    _displayTarget = null;
    return target;
  }

  void _logScreen(BottomDestination destination) {
    _analytics.logEvent(AnalyticsEvent.screenView(destination.value));
  }

  void _emit(MainShellEvent event) {
    if (!_disposed) _events.add(event);
  }

  @override
  void dispose() {
    _disposed = true;
    _cancelToken.cancel();
    unawaited(_events.close());
    super.dispose();
  }
}
