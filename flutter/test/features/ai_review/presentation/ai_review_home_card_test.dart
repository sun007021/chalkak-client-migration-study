import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/ai_review/domain/ai_review_target.dart';
import 'package:chalkak/features/ai_review/presentation/ai_review_home_card.dart';
import 'package:chalkak/features/ai_review/presentation/ai_review_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/ai_review_fakes.dart';
import '../../../support/ui_helpers.dart';

Finder _text(String id, String text) =>
    find.descendant(of: byId(id), matching: find.text(text));

AiRig _home() => AiRig(surface: AiReviewSurface.home);

Future<void> _open(WidgetTester tester, AiRig r) =>
    pumpAiWidget(tester, r, (s) => AiReviewHomeCard(session: s));

void main() {
  group('상태별 카드', () {
    widgetTest(
      'REQ-AIR-052 TC-AIR-057 NONE이면 "이 사진, AI에게 피드백 받아보기"와 요청 버튼이 보인다',
      (tester) async {
        final r = _home();
        await _open(tester, r);
        expect(byId(AiReviewTestIds.homeCard), findsOneWidget);
        expect(
          _text(AiReviewTestIds.homeRequestButton, Copy.aiCardRequest),
          findsOneWidget,
        );
      },
    );

    widgetTest('REQ-AIR-052 TC-AIR-012 NONE 카드를 누르면 시작 시트가 열리고 닫으면 POST가 없다', (
      tester,
    ) async {
      final r = _home();
      await _open(tester, r);
      await tester.tap(byId(AiReviewTestIds.homeRequestButton));
      await settleSheet(tester);
      expect(byId(AiReviewTestIds.startSheetRoot), findsOneWidget);
      await tester.tap(byId(AiReviewTestIds.startSheetCloseButton));
      await settleSheet(tester);
      expect(r.api.postCalls(), 0);
    });

    widgetTest('REQ-AIR-052 TC-AIR-057 PROCESSING이면 "AI 피드백이 진행중이에요"가 보인다', (
      tester,
    ) async {
      final r = _home();
      r.api.get([fx(aiGet('processing'))]);
      await _open(tester, r);
      expect(
        _text(AiReviewTestIds.homeProcessing, Copy.aiCardProcessing),
        findsOneWidget,
      );
    });

    widgetTest(
      'REQ-AIR-052 TC-AIR-057 COMPLETED면 완료 문구와 "자세히 보기"가 보이고 누르면 결과 시트가 열린다',
      (tester) async {
        final r = _home();
        r.api.get([fx(aiGet('completed'))]);
        await _open(tester, r);
        expect(
          _text(AiReviewTestIds.homeCompleted, Copy.aiCardCompleted),
          findsOneWidget,
        );
        expect(
          _text(AiReviewTestIds.homeDetailButton, Copy.aiCardDetail),
          findsOneWidget,
        );
        await tester.tap(byId(AiReviewTestIds.homeDetailButton));
        await settleSheet(tester);
        expect(byId(AiReviewTestIds.resultSheetRoot), findsOneWidget);
      },
    );

    widgetTest(
      'REQ-AIR-052 TC-AIR-020 FAILED + 재요청 가능이면 "재요청"이 있고 누르면 시트 없이 바로 POST한다',
      (tester) async {
        final r = _home();
        r.api.get([fx(aiGet('failed-can-retry'))]);
        await _open(tester, r);
        expect(
          _text(AiReviewTestIds.homeFailed, Copy.aiCardFailed),
          findsOneWidget,
        );
        expect(
          _text(AiReviewTestIds.homeRetryButton, Copy.aiCardRetry),
          findsOneWidget,
        );
        await tester.tap(byId(AiReviewTestIds.homeRetryButton));
        await settleSheet(tester);
        expect(byId(AiReviewTestIds.startSheetRoot), findsNothing);
        expect(r.api.postCalls(), 1);
      },
    );

    widgetTest('REQ-AIR-052 FAILED + 재요청 불가면 실패 문구만 있고 "재요청"이 없다', (
      tester,
    ) async {
      final r = _home();
      r.api.get([fx(aiGet('failed-cannot-retry'))]);
      await _open(tester, r);
      expect(byId(AiReviewTestIds.homeFailed), findsOneWidget);
      expect(byId(AiReviewTestIds.homeRetryButton), findsNothing);
    });

    widgetTest('REQ-AIR-053 404면 카드가 사라진다', (tester) async {
      final r = _home();
      r.api.get([fx(aiGet('404-not-found'))]);
      await _open(tester, r);
      expect(byId(AiReviewTestIds.homeRequestButton), findsNothing);
      expect(r.api.getCalls(), 1);
    });
  });

  group('가시성', () {
    widgetTest('TC-AIR-018 visible=false(다른 탭)에서는 요청하지 않고 돌아오면 조회한다', (
      tester,
    ) async {
      final r = _home();
      r.api.get([fx(aiGet('processing'))]);
      addTearDown(r.session.dispose);
      r.session.setTarget(r.target);
      await pumpScreen(
        tester,
        Scaffold(body: AiReviewHomeCard(session: r.session, visible: false)),
      );
      await tester.pump(const Duration(seconds: 30));
      expect(r.api.totalCalls, 0);
      await pumpScreen(
        tester,
        Scaffold(body: AiReviewHomeCard(session: r.session)),
      );
      expect(r.api.getCalls(), 1);
    });
  });
}
