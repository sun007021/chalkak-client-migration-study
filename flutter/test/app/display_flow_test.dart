import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/ui/toast/toast_test_ids.dart';
import 'package:chalkak/features/display/domain/display_models.dart';
import 'package:chalkak/features/display/presentation/display_test_ids.dart';
import 'package:chalkak/features/feed/presentation/feed_test_ids.dart';
import 'package:chalkak/features/home/presentation/home_test_ids.dart';
import 'package:chalkak/features/navigation/presentation/navigation_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/app_harness.dart';
import '../support/display_fakes.dart';
import '../support/home_fakes.dart' show fx;
import '../support/net_harness.dart';

/// 메인 셸 위에서 홈 → 전시 탭 → 상세로 이어지는 앱 수준 흐름.
final _first = postIdOf(2);

Future<AppHarness> _enterMain(
  WidgetTester tester, {
  void Function(AppHarness h)? script,
}) async {
  tester.view.physicalSize = const Size(800, 6000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final h = AppHarness(session: sessionAt());
  h.homeFakes.api.standard();
  final display = h.homeFakes.displayRepository;
  display.servePage(today, DisplaySort.recent, 1, recentP1Fx);
  display.servePage(today, DisplaySort.recent, 2, recentP2Fx);
  display.servePage(today, DisplaySort.popular, 1, popularP1Fx);
  h.homeFakes.postRepository.onDetail(_first, [
    Reply.ok(detailFx(detailMineTodayFx)),
  ]);
  h.homeFakes.likeRepository.seedServer(_first, likeCount: 38);
  script?.call(h);
  await tester.pumpWidget(h.app);
  await tester.pump(const Duration(milliseconds: 100));
  h.preloader.completer.complete();
  for (var i = 0; i < 20; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
  return h;
}

Future<void> _settle(WidgetTester tester, {int ticks = 12}) async {
  for (var i = 0; i < ticks; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
}

void main() {
  widgetTest(
    'TC-NAV-004 TC-DISP-055 홈에서 전시 탭을 열고 사진을 누르면 상세가 열리고 뒤로 가면 전시로 돌아온다',
    (tester) async {
      final h = await _enterMain(tester);
      expect(byId(HomeTestIds.root), findsOneWidget);

      await tester.tap(byId(NavigationTestIds.tabDisplay));
      await _settle(tester);
      expect(byId(DisplayTestIds.root), findsOneWidget);
      final display = h.homeFakes.displayRepository;
      expect(display.callsFor(DisplaySort.recent), isNotEmpty);

      await tester.tap(byId(DisplayTestIds.item(_first)));
      await _settle(tester);
      expect(byId(FeedTestIds.root), findsOneWidget);
      expect(h.homeFakes.postRepository.detailCalls, [_first]);

      await tester.tap(byId(FeedTestIds.backButton));
      await _settle(tester);
      expect(byId(FeedTestIds.root), findsNothing);
      expect(byId(DisplayTestIds.root), findsOneWidget);
      expect(byId(DisplayTestIds.item(_first)), findsOneWidget);
    },
  );

  widgetTest('TC-DISP-055 홈 랭킹 사진을 누르면 상세가 열리고 뒤로 가면 홈이다', (tester) async {
    final h = await _enterMain(tester);
    await tester.tap(byId(HomeTestIds.popularItem(_first)));
    await _settle(tester);
    expect(byId(FeedTestIds.root), findsOneWidget);
    expect(h.homeFakes.postRepository.detailCalls, [_first]);

    await tester.tap(byId(FeedTestIds.backButton));
    await _settle(tester);
    expect(byId(FeedTestIds.root), findsNothing);
    expect(byId(HomeTestIds.root), findsOneWidget);
  });

  widgetTest('TC-LIKE-005 홈 랭킹의 하트는 공용 좋아요 저장소로 가서 낙관 반영된다', (tester) async {
    final h = await _enterMain(tester);
    final likes = h.homeFakes.likeRepository;
    await tester.tap(byId(HomeTestIds.popularLikeButton(_first)));
    await tester.pump(const Duration(milliseconds: 50));
    expect(h.homeFakes.likeStore.stateOf(_first)?.isLiked, isTrue);
    await _settle(tester);
    expect(likes.putCount, 1);
  });

  widgetTest('TC-LIKE-030 좋아요 실패 토스트는 메인에서 한 번만 나간다', (tester) async {
    final h = await _enterMain(
      tester,
      script: (h) => h.homeFakes.likeRepository.failures.add(networkError()),
    );
    await tester.tap(byId(HomeTestIds.popularLikeButton(_first)));
    await _settle(tester, ticks: 3);
    expect(
      find.descendant(
        of: byId(ToastTestIds.message),
        matching: find.text(Copy.likeErrorGeneric),
      ),
      findsOneWidget,
    );
    expect(h.homeFakes.likeStore.stateOf(_first)?.isLiked, isFalse);
  });

  widgetTest('TC-FEED-044 삭제된 게시물은 홈 랭킹에서 빠진다', (tester) async {
    final h = await _enterMain(tester);
    expect(byId(HomeTestIds.popularItem(_first)), findsOneWidget);
    // 지운 뒤 서버 목록에도 그 게시물이 없다.
    h.homeFakes.api.popular('2026-10-27', [
      fx('home/posts-list__popular-3.json'),
    ]);
    h.homeFakes.postEvents.publishRemoved(_first);
    await _settle(tester);
    expect(byId(HomeTestIds.popularItem(_first)), findsNothing);
  });
}
