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
  for (var i = 0; i < 20; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
  return h;
}

Future<void> _tap(WidgetTester tester, AppHarness h, String fixture) async {
  unawaited(
    h.dependencies.notification.coordinator.onTapped(pushPayloadFx(fixture)),
  );
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

bool _canPop(WidgetTester tester) =>
    Navigator.of(tester.element(find.byType(Scaffold).first)).canPop();

void main() {
  widgetTest('TC-PUSH-065 이미 홈이면 TOPIC 푸시가 화면을 더 쌓지 않고 새로고침한다', (tester) async {
    final h = await _enterMain(tester);
    final before = h.homeFakes.api.todayCalls;
    await _tap(tester, h, 'payload__topic');
    expect(_canPop(tester), isFalse);
    expect(byId(HomeTestIds.root), findsOneWidget);
    expect(h.homeFakes.api.todayCalls, greaterThan(before));
    expect(h.notificationRepository.readCalls, isEmpty);
  });

  widgetTest('TC-PUSH-064 같은 게시물 상세가 열려 있으면 승인·AI 푸시가 교체하고 쌓지 않는다', (
    tester,
  ) async {
    final h = await _enterMain(tester);
    h.homeFakes.postRepository.onDetail(myPostId, [
      Reply.ok(detailFx(detailMineTodayFx)),
      Reply.ok(detailFx(detailMineTodayFx)),
    ]);
    await _tap(tester, h, 'payload__post-approved');
    expect(find.byType(FeedRoute), findsOneWidget);
    await _tap(tester, h, 'payload__ai-review-completed');
    expect(find.byType(FeedRoute, skipOffstage: false), findsOneWidget);
    expect(h.notificationRepository.readCalls, [notiId(1), notiId(3)]);
    // 한 번 뒤로 가면 홈이다(두 겹이 아니다).
    Navigator.of(tester.element(find.byType(FeedRoute))).pop();
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.byType(FeedRoute), findsNothing);
    expect(byId(HomeTestIds.root), findsOneWidget);
  });

  widgetTest('NOTICE 푸시는 알림 상세를 열고 알림함으로 버튼 없이 뒤로 가면 홈이다', (tester) async {
    final h = await _enterMain(tester);
    h.notificationRepository.onDetail(notiId(5), [
      Reply.ok(notiDetailFx(detailNoticeFx)),
    ]);
    await _tap(tester, h, 'payload__notice');
    expect(byId(NotificationTestIds.detailRoot), findsOneWidget);
    expect(h.notificationRepository.readCalls, [notiId(5)]);
  });

  widgetTest('알 수 없는 type 푸시는 알림함을 열고 이미 열려 있으면 쌓지 않는다', (tester) async {
    final h = await _enterMain(tester);
    await _tap(tester, h, 'payload__unknown-type');
    expect(byId(NotificationTestIds.inboxRoot), findsOneWidget);
    await _tap(tester, h, 'payload__missing-type');
    expect(byId(NotificationTestIds.inboxRoot), findsOneWidget);
    expect(h.notificationRepository.readCalls, isEmpty);
  });
}
