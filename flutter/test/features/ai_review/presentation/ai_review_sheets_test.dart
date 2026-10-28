import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/ai_review/presentation/ai_review_pill.dart';
import 'package:chalkak/features/ai_review/presentation/ai_review_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/ai_review_fakes.dart';
import '../../../support/fake_adapter.dart';
import '../../../support/fixtures.dart';
import '../../../support/ui_helpers.dart';

Finder _text(String id, String text) =>
    find.descendant(of: byId(id), matching: find.text(text));

/// 결과 시트가 열린 상태로 만든다.
Future<AiRig> _openResult(
  WidgetTester tester, {
  String fixture = 'completed',
  FakeResponse? response,
}) async {
  final r = AiRig();
  r.api.get([response ?? fx(aiGet(fixture))]);
  await pumpAiWidget(tester, r, (s) => AiReviewPill(session: s));
  await tester.tap(byId(AiReviewTestIds.feedResultButton));
  await settleSheet(tester);
  return r;
}

void main() {
  group('결과 시트', () {
    widgetTest('TC-AIR-049 TC-AIR-057 요약, 점수, 기준, 섹션이 정해진 순서로 보인다', (
      tester,
    ) async {
      await _openResult(tester);
      expect(byId(AiReviewTestIds.resultSheetRoot), findsOneWidget);
      expect(
        _text(
          AiReviewTestIds.resultSheetFeedbackSummary,
          '빛을 따라 시선이 흐르는 안정적인 구도',
        ),
        findsOneWidget,
      );
      expect(
        _text(AiReviewTestIds.resultSheetOverallScore, '7.5'),
        findsOneWidget,
      );
      final item = AiReviewTestIds.resultSheetCriteriaItem('COMPOSITION');
      expect(_text(item, '구도'), findsOneWidget);
      expect(_text(item, '7.5'), findsOneWidget);

      double top(String id) => tester.getTopLeft(byId(id)).dy;
      final order = [
        AiReviewTestIds.resultSheetFeedbackSummary,
        AiReviewTestIds.resultSheetFeedbackStrength,
        AiReviewTestIds.resultSheetFeedbackWeakness,
        AiReviewTestIds.resultSheetFeedbackSuggestion,
      ];
      for (var i = 1; i < order.length; i++) {
        expect(top(order[i]), greaterThan(top(order[i - 1])), reason: order[i]);
      }
      for (final title in [
        Copy.aiResultStrength,
        Copy.aiResultWeakness,
        Copy.aiResultSuggestion,
      ]) {
        expect(find.text(title), findsOneWidget, reason: title);
      }
    });

    widgetTest('TC-AIR-050 종합 점수의 접근성 라벨은 "전체 점수 10점 만점에 7.5점"이다', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await _openResult(tester);
      expect(find.bySemanticsLabel('전체 점수 10점 만점에 7.5점'), findsOneWidget);
      semantics.dispose();
    });

    widgetTest('TC-AIR-051 distinctivePerspective=true면 해석 배지가 보인다', (
      tester,
    ) async {
      await _openResult(tester);
      expect(
        _text(
          AiReviewTestIds.resultSheetDistinctiveBadge,
          Copy.aiResultPerspectiveBadge,
        ),
        findsOneWidget,
      );
    });

    widgetTest('TC-AIR-051 false면 배지가 없다', (tester) async {
      await _openResult(tester, fixture: 'completed-not-distinct');
      expect(byId(AiReviewTestIds.resultSheetRoot), findsOneWidget);
      expect(byId(AiReviewTestIds.resultSheetDistinctiveBadge), findsNothing);
    });

    widgetTest('TC-AIR-010 기준이 3개이고 문구가 상한 길이여도 레이아웃이 깨지지 않는다', (tester) async {
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await _openResult(tester, fixture: 'completed-long-text');
      for (final key in ['COMPOSITION', 'LIGHT', 'SUBJECT']) {
        expect(
          byId(AiReviewTestIds.resultSheetCriteriaItem(key)),
          findsOneWidget,
          reason: key,
        );
      }
      expect(tester.takeException(), isNull);
    });

    widgetTest('TC-AIR-010 기준이 0개여도 시트가 그려진다', (tester) async {
      final json = (Fixture.load(aiGet('completed')) as Map)
          .cast<String, Object?>();
      (json['result']! as Map<String, Object?>)['criteria'] = <Object?>[];
      await _openResult(tester, response: FakeResponse.json(200, json));
      expect(byId(AiReviewTestIds.resultSheetRoot), findsOneWidget);
      expect(
        byId(AiReviewTestIds.resultSheetCriteriaItem('COMPOSITION')),
        findsNothing,
      );
      expect(tester.takeException(), isNull);
    });

    widgetTest('TC-AIR-052 점수 영역의 기준 안내를 누르면 다이얼로그가 열리고 닫을 수 있다', (
      tester,
    ) async {
      final r = await _openResult(tester);
      await tester.tap(byId(AiReviewTestIds.resultSheetCriteriaInfoButton));
      await settleSheet(tester);
      expect(byId(AiReviewTestIds.resultSheetCriteriaDialog), findsOneWidget);
      expect(
        find.descendant(
          of: byId(AiReviewTestIds.resultSheetCriteriaDialog),
          matching: find.text(Copy.aiResultCriteriaDialogTitle),
        ),
        findsOneWidget,
      );
      expect(r.state.criteriaDialogOpen, isTrue);

      await tester.binding.handlePopRoute();
      await settleSheet(tester);
      expect(byId(AiReviewTestIds.resultSheetCriteriaDialog), findsNothing);
      expect(r.state.criteriaDialogOpen, isFalse);
      expect(byId(AiReviewTestIds.resultSheetRoot), findsOneWidget);
    });

    widgetTest('TC-AIR-057 닫기 버튼으로 결과 시트를 닫으면 요청이 없다', (tester) async {
      final r = await _openResult(tester);
      await tester.tap(byId(AiReviewTestIds.resultSheetCloseButton));
      await settleSheet(tester);
      expect(byId(AiReviewTestIds.resultSheetRoot), findsNothing);
      expect(r.state.sheet, isNull);
      expect(r.api.postCalls(), 0);
    });
  });

  group('실패 시트', () {
    widgetTest('TC-AIR-053 "AI 피드백을 생성하지 못했어요"와 "확인"이 보이고 확인하면 닫힌다', (
      tester,
    ) async {
      final r = AiRig();
      r.api.get([fx(aiGet('failed-cannot-retry'))]);
      await pumpAiWidget(tester, r, (s) => AiReviewPill(session: s));
      await tester.tap(byId(AiReviewTestIds.feedFailedButton));
      await settleSheet(tester);
      expect(
        find.descendant(
          of: byId(AiReviewTestIds.failedSheetRoot),
          matching: find.text(Copy.aiFailedTitle),
        ),
        findsOneWidget,
      );
      expect(
        _text(AiReviewTestIds.failedSheetConfirmButton, Copy.aiFailedConfirm),
        findsOneWidget,
      );
      await tester.tap(byId(AiReviewTestIds.failedSheetConfirmButton));
      await settleSheet(tester);
      expect(byId(AiReviewTestIds.failedSheetRoot), findsNothing);
      expect(r.api.postCalls(), 0);
    });

    widgetTest('TC-AIR-054 결과·실패 시트 문구에 "AI 리뷰"가 없다', (tester) async {
      await _openResult(tester);
      final texts = [
        for (final w in tester.widgetList<Text>(find.byType(Text)))
          if (w.data != null) w.data!,
      ];
      expect(texts, isNotEmpty);
      for (final text in texts) {
        expect(text, isNot(contains('AI 리뷰')), reason: text);
      }
    });
  });
}
