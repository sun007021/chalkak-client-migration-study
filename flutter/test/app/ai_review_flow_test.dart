import 'package:chalkak/app/feed_route.dart';
import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/ai_review/presentation/ai_review_test_ids.dart';
import 'package:chalkak/features/display/domain/display_models.dart';
import 'package:chalkak/features/display/presentation/display_test_ids.dart';
import 'package:chalkak/features/feed/domain/feed_target.dart';
import 'package:chalkak/features/feed/presentation/feed_test_ids.dart';
import 'package:chalkak/features/home/presentation/home_test_ids.dart';
import 'package:chalkak/features/navigation/presentation/navigation_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/ai_review_fakes.dart';
import '../support/app_harness.dart';
import '../support/display_fakes.dart';
import '../support/net_harness.dart';

/// 메인 셸의 홈 카드와 상세 알약이 AI 피드백 세션에 이어지는 앱 수준 흐름.
final _mine = postIdOf(1);
final _other = postIdOf(2);

Future<({AppHarness h, AiApi ai})> _enterMain(
  WidgetTester tester, {
  void Function(AppHarness h)? script,
  void Function(AiApi ai)? scriptAi,
}) async {
  tester.view.physicalSize = const Size(800, 6000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final h = AppHarness(session: sessionAt(userId: myUserId));
  h.homeFakes.useRealAiCard = true;
  h.homeFakes.api.standard();
  final ai = AiApi(h.http.adapter);
  scriptAi?.call(ai);
  final display = h.homeFakes.displayRepository;
  display.servePage(today, DisplaySort.recent, 1, recentP1Fx);
  display.servePage(today, DisplaySort.recent, 2, recentP2Fx);
  display.servePage(today, DisplaySort.popular, 1, popularP1Fx);
  h.homeFakes.postRepository.onDetail(_mine, [
    Reply.ok(detailFx(detailMineTodayFx)),
  ]);
  h.homeFakes.postRepository.onDetail(_other, [
    Reply.ok(detailFx(detailOtherFx)),
  ]);
  h.homeFakes.likeRepository.seedServer(_mine, likeCount: 38);
  h.homeFakes.likeRepository.seedServer(_other, likeCount: 5);
  script?.call(h);
  await tester.pumpWidget(h.app);
  await tester.pump(const Duration(milliseconds: 100));
  h.preloader.completer.complete();
  await _settle(tester, ticks: 20);
  return (h: h, ai: ai);
}

Future<void> _settle(WidgetTester tester, {int ticks = 12}) async {
  for (var i = 0; i < ticks; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
}

Finder _text(String id, String text) =>
    find.descendant(of: byId(id), matching: find.text(text));

void main() {
  widgetTest('REQ-AIR-052 TC-AIR-057 오늘 승인된 내 사진이면 홈에 AI 카드가 뜨고 GET만 한 번 나간다', (
    tester,
  ) async {
    final (:h, :ai) = await _enterMain(tester);
    expect(byId(HomeTestIds.heroPhoto), findsOneWidget);
    expect(byId(AiReviewTestIds.homeCard), findsOneWidget);
    expect(
      _text(AiReviewTestIds.homeRequestButton, Copy.aiCardRequest),
      findsOneWidget,
    );
    expect(ai.getCalls(), 1);
    expect(ai.postCalls(), 0);
    expect(h.homeFakes.homeAiReview.target?.postId, _mine);
  });

  widgetTest('TC-AIR-018 REQ-AIR-052 홈 카드는 다른 탭에서는 조회하지 않고 돌아오면 다시 조회한다', (
    tester,
  ) async {
    final (:h, :ai) = await _enterMain(
      tester,
      scriptAi: (ai) => ai.get([fx(aiGet('processing'))]),
    );
    expect(
      _text(AiReviewTestIds.homeProcessing, Copy.aiCardProcessing),
      findsOneWidget,
    );
    await tester.tap(byId(NavigationTestIds.tabDisplay));
    await _settle(tester, ticks: 4);
    final away = ai.getCalls();
    await _settle(tester, ticks: 40);
    expect(ai.getCalls(), away, reason: '홈이 가려진 동안 폴링하지 않는다');

    await tester.tap(byId(NavigationTestIds.tabHome));
    await _settle(tester, ticks: 4);
    expect(ai.getCalls(), away + 1);
    expect(h.homeFakes.homeAiReview.target?.postId, _mine);
  });

  widgetTest('TC-AIR-044 계정 정리(clearAll) 뒤에는 홈 세션의 결과가 비워진다', (tester) async {
    final (:h, :ai) = await _enterMain(
      tester,
      scriptAi: (ai) => ai.get([fx(aiGet('completed'))]),
    );
    expect(byId(AiReviewTestIds.homeDetailButton), findsOneWidget);
    await h.homeFakes.homeAiReview.clearAll();
    await tester.pump();
    expect(h.homeFakes.homeAiReview.target, isNull);
    expect(h.homeFakes.homeAiReview.state.review, isNull);
    expect(byId(AiReviewTestIds.homeCard), findsNothing);
  });

  widgetTest('TC-AIR-017 REQ-AIR-001 내 게시물 상세에는 AI 알약이 뜨고 GET만 보낸다', (
    tester,
  ) async {
    final (:h, :ai) = await _enterMain(tester);
    await tester.tap(byId(NavigationTestIds.tabDisplay));
    await _settle(tester);
    final before = ai.getCalls();
    await tester.tap(byId(DisplayTestIds.item(_mine)));
    await _settle(tester);
    expect(byId(FeedTestIds.root), findsOneWidget);
    expect(
      _text(AiReviewTestIds.feedRequestButton, Copy.aiPillRequest),
      findsOneWidget,
    );
    expect(ai.getCalls(), before + 1);
    expect(ai.postCalls(), 0);

    // 상세를 닫으면 세션이 정리되어 더 조회하지 않는다.
    await tester.tap(byId(FeedTestIds.backButton));
    await _settle(tester);
    expect(byId(FeedTestIds.root), findsNothing);
    expect(byId(AiReviewTestIds.feedRequestButton), findsNothing);
  });

  widgetTest('TC-AIR-017 REQ-AIR-007 남의 게시물 상세에는 알약도 AI 요청도 없다', (
    tester,
  ) async {
    final (:h, :ai) = await _enterMain(tester);
    await tester.tap(byId(NavigationTestIds.tabDisplay));
    await _settle(tester);
    final before = ai.totalCalls;
    await tester.tap(byId(DisplayTestIds.item(_other)));
    await _settle(tester);
    expect(byId(FeedTestIds.root), findsOneWidget);
    expect(byId(AiReviewTestIds.feedRequestButton), findsNothing);
    expect(byId(AiReviewTestIds.feedChecking), findsNothing);
    expect(ai.totalCalls, before);
  });

  widgetTest(
    'TC-AIR-058 REQ-AIR-046 AI 푸시로 연 상세는 COMPLETED면 결과 시트를 한 번 자동으로 연다',
    (tester) async {
      final (:h, :ai) = await _enterMain(
        tester,
        scriptAi: (ai) => ai.get([fx(aiGet('completed'))]),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: FeedRoute(
            dependencies: h.dependencies,
            target: FeedTarget(
              postId: _mine,
              origin: FeedOrigin.push,
              isMine: true,
            ),
            userId: myUserId,
            openAiFeedback: true,
          ),
        ),
      );
      await _settle(tester);
      expect(byId(AiReviewTestIds.resultSheetRoot), findsOneWidget);
      expect(ai.postCalls(), 0);
    },
  );
}
