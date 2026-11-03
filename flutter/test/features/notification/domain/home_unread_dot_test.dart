import 'dart:async';

import 'package:chalkak/features/home/presentation/home_screen.dart';
import 'package:chalkak/features/home/presentation/home_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/app_harness.dart' show byId, widgetTest;
import '../../../support/fake_async_helpers.dart';
import '../../../support/home_fakes.dart';
import '../../../support/net_harness.dart';

/// 홈 알림 벨의 미읽음 점(D-10). 점의 조회 규칙은 알림 영역이 정하고 홈이 그린다.
const _unreadTrue = 'notification/unread-status__true.json';
const _unreadFalse = 'notification/unread-status__false.json';
const _unreadError = 'notification/unread-status__internal-error.json';
const _wait = Duration(seconds: 5);

Future<void> _pumpHome(WidgetTester tester, HomeRig r) async {
  tester.view.physicalSize = const Size(800, 6000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: HomeScreen(
          viewModel: r.home,
          aiCardBuilder: (
            context,
            postId, {
            required topicDate,
            required visible,
          }) => const SizedBox.shrink(),
        ),
      ),
    ),
  );
  unawaited(r.home.load());
  await _settle(tester);
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 500));
  }
}

void main() {
  widgetTest('TC-NOTI-049 hasUnread=true면 홈 알림 벨에 점이 보이고 false면 점이 없다', (
    tester,
  ) async {
    final r = HomeRig();
    r.api.unread([fx(_unreadTrue)]);
    await _pumpHome(tester, r);
    expect(byId(HomeTestIds.notificationButton), findsOneWidget);
    expect(byId(HomeTestIds.notificationUnreadDot), findsOneWidget);
    r.api.unread([fx(_unreadFalse)]);
    unawaited(r.home.refreshUnread());
    await _settle(tester);
    expect(byId(HomeTestIds.notificationUnreadDot), findsNothing);
  });

  fakeTest('TC-NOTI-051 게스트는 홈 진입·복귀·재표시에서도 unread-status를 조회하지 않고 점이 없다', (
    async,
  ) {
    final r = HomeRig(guest: true);
    r.loadHome(async);
    r.home.onBecameVisible();
    advance(async, _wait);
    r.home.onForeground();
    advance(async, _wait);
    r.home.refreshUnread();
    advance(async, _wait);
    expect(r.api.unreadCalls, 0);
    expect(
      r.http.adapter.requests.where(
        (q) => q.uri.path.endsWith('/notifications/unread-status'),
      ),
      isEmpty,
    );
    expect(r.home.state.hasUnread, isFalse);
  });

  fakeTest('TC-NOTI-052 unread-status 조회가 실패하면 이전 점 상태를 유지하고 토스트·오류 UI가 없다', (
    async,
  ) {
    final r = HomeRig();
    r.api.unread([fx(_unreadTrue), fx(_unreadError)]);
    r.loadHome(async);
    expect(r.home.state.hasUnread, isTrue);
    r.home.refreshUnread();
    advance(async, _wait);
    expect(r.home.state.hasUnread, isTrue, reason: '실패해도 직전 값 유지');
    expect(r.toast.messages, isEmpty);
  });

  fakeTest('TC-NOTI-052 점이 없던 상태에서 실패해도 점이 생기지 않는다', (async) {
    final r = HomeRig();
    r.api.unread([fx(_unreadFalse), fx(_unreadError)]);
    r.loadHome(async);
    r.home.refreshUnread();
    advance(async, _wait);
    expect(r.home.state.hasUnread, isFalse);
    expect(r.toast.messages, isEmpty);
  });
}
