import 'dart:convert';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/ui/toast/toast_test_ids.dart';
import 'package:chalkak/features/display/domain/display_models.dart';
import 'package:chalkak/features/feed/presentation/feed_test_ids.dart';
import 'package:chalkak/features/home/presentation/home_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/app_harness.dart';
import '../support/display_fakes.dart';
import '../support/fake_adapter.dart';
import '../support/fixtures.dart';
import '../support/home_fakes.dart' show fx;
import '../support/net_harness.dart';

/// 홈 랭킹에 있는 내 오늘 사진(popular-8의 첫 항목)을 피드에서 지우고 홈으로 돌아오는 흐름.
final _mine = postIdOf(2);

Future<void> _settle(WidgetTester tester, {int ticks = 6}) async {
  for (var i = 0; i < ticks; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
}

void main() {
  widgetTest(
    'TC-HOME-046 오늘 게시물을 피드에서 지우고 홈으로 오면 히어로는 Empty이고 주간 칸과 랭킹에서 빠지며 토스트가 한 번 뜬다',
    (tester) async {
      tester.view.physicalSize = const Size(800, 6000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final h = AppHarness(
        session: sessionAt(userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      );
      h.homeFakes.api.standard();
      // 내 오늘 사진이 곧 랭킹 첫 항목이다. 삭제 뒤 서버 응답에서는 모두 빠진다.
      h.homeFakes.api.today([
        FakeResponse.json(200, {
          'topicDate': '2026-10-27',
          'isPosted': true,
          'postId': _mine,
          'moderationStatus': 'APPROVED',
        }),
        fx('home/posts-today__not-posted.json'),
      ]);
      final week = Fixture.response(
        'home/posts-calendar__2026-10-week-approved.json',
      ).bodyText.replaceAll('222222222201', '222222222202');
      final weekAfter = jsonDecode(week) as Map<String, dynamic>
        ..update(
          'posts',
          (posts) => [
            for (final p in posts as List)
              if ((p as Map)['topicDate'] != '2026-10-27') p,
          ],
        );
      h.homeFakes.api.calendar(2026, 10, [
        FakeResponse(body: week),
        FakeResponse.json(200, weekAfter),
      ]);
      h.homeFakes.api.popular('2026-10-27', [
        fx('home/posts-list__popular-8.json'),
        fx('home/posts-list__popular-3.json'),
      ]);
      final display = h.homeFakes.displayRepository;
      display.servePage(today, DisplaySort.recent, 1, recentP1Fx);
      h.homeFakes.postRepository.onDetail(_mine, [
        Reply.ok(detailFx(detailMineTodayFx)),
      ]);
      h.homeFakes.postRepository.onDelete(_mine, [Reply.ok(null)]);
      await tester.pumpWidget(h.app);
      await tester.pump(const Duration(milliseconds: 100));
      h.preloader.completer.complete();
      await _settle(tester, ticks: 20);

      expect(byId(HomeTestIds.heroPhoto), findsOneWidget);
      expect(byId(HomeTestIds.weekPhoto('2026-10-27')), findsOneWidget);
      expect(byId(HomeTestIds.popularItem(_mine)), findsOneWidget);

      await tester.tap(byId(HomeTestIds.popularItem(_mine)));
      await _settle(tester);
      await tester.tap(byId(FeedTestIds.deleteButton));
      await _settle(tester, ticks: 2);
      await tester.tap(byId(FeedTestIds.deleteConfirmButton));
      await _settle(tester, ticks: 5);

      expect(byId(FeedTestIds.root), findsNothing);
      expect(byId(HomeTestIds.root), findsOneWidget);
      expect(byId(HomeTestIds.heroEmpty), findsOneWidget);
      expect(byId(HomeTestIds.heroPhoto), findsNothing);
      expect(byId(HomeTestIds.weekPhoto('2026-10-27')), findsNothing);
      expect(byId(HomeTestIds.popularItem(_mine)), findsNothing);
      expect(
        find.descendant(
          of: byId(ToastTestIds.message),
          matching: find.text(Copy.feedDeleteSuccess),
        ),
        findsOneWidget,
      );
    },
  );
}
