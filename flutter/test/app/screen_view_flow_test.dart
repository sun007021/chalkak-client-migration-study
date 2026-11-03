import 'dart:async';

import 'package:chalkak/app/feed_route.dart';
import 'package:chalkak/features/home/presentation/home_test_ids.dart';
import 'package:chalkak/features/notification/presentation/notification_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/app_harness.dart';
import '../support/net_harness.dart';
import '../support/notification_fakes.dart';

Future<AppHarness> _enterMain(WidgetTester tester) async {
  final h = AppHarness(session: sessionAt());
  tester.view.physicalSize = const Size(800, 6000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  h.homeFakes.api.standard();
  h.notificationRepository.servePage(1, pageFx1);
  h.notificationRepository.servePage(2, pageFx2Last);
  await tester.pumpWidget(h.app);
  await tester.pump(const Duration(milliseconds: 100));
  h.preloader.completer.complete();
  await _settle(tester, 20);
  return h;
}

Future<void> _settle(WidgetTester tester, [int frames = 10]) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> _tap(WidgetTester tester, AppHarness h, String fixture) async {
  unawaited(
    h.dependencies.notification.coordinator.onTapped(pushPayloadFx(fixture)),
  );
  await _settle(tester);
}

Future<void> _back(WidgetTester tester, Finder from) async {
  Navigator.of(tester.element(from)).pop();
  await _settle(tester);
}

void main() {
  widgetTest('TC-ANL-017 게시물 상세에서 뒤로 가 홈으로 돌아오면 홈의 screen_view를 다시 보낸다', (
    tester,
  ) async {
    final h = await _enterMain(tester);
    h.homeFakes.postRepository.onDetail(myPostId, [
      Reply.ok(detailFx(detailMineTodayFx)),
    ]);
    await _tap(tester, h, 'payload__post-approved');
    expect(find.byType(FeedRoute), findsOneWidget);
    expect(h.analytics.screenNames, ['home', 'feed']);

    await _back(tester, find.byType(FeedRoute));
    expect(byId(HomeTestIds.root), findsOneWidget);
    expect(h.analytics.screenNames, ['home', 'feed', 'home']);
  });

  widgetTest(
    'TC-ANL-017 알림 상세에서 뒤로 가면 알림함, 알림함에서 뒤로 가면 홈의 screen_view를 다시 보낸다',
    (tester) async {
      final h = await _enterMain(tester);
      h.notificationRepository.onDetail(notiId(5), [
        Reply.ok(notiDetailFx(detailNoticeFx)),
      ]);
      await _tap(tester, h, 'payload__unknown-type');
      expect(byId(NotificationTestIds.inboxRoot), findsOneWidget);
      await _tap(tester, h, 'payload__notice');
      expect(byId(NotificationTestIds.detailRoot), findsOneWidget);
      expect(h.analytics.screenNames, [
        'home',
        'notifications',
        'notification_detail',
      ]);

      await _back(tester, byId(NotificationTestIds.detailRoot));
      expect(h.analytics.screenNames.last, 'notifications');
      await _back(tester, byId(NotificationTestIds.inboxRoot));
      expect(byId(HomeTestIds.root), findsOneWidget);
      expect(h.analytics.screenNames.last, 'home');
      expect(h.analytics.screenNames, hasLength(5));
    },
  );
}
