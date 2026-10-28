import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/ai_review/presentation/ai_review_pill.dart';
import 'package:chalkak/features/ai_review/presentation/ai_review_test_ids.dart';
import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/ai_review_fakes.dart';
import '../../../support/net_harness.dart' show t0;
import '../../../support/ui_helpers.dart';

Finder _text(String id, String text) =>
    find.descendant(of: byId(id), matching: find.text(text));

Set<String> _allTexts(WidgetTester tester) => {
  for (final w in tester.widgetList<Text>(find.byType(Text)))
    if (w.data != null) w.data!,
};

Future<void> _open(WidgetTester tester, AiRig r) =>
    pumpAiWidget(tester, r, (s) => AiReviewPill(session: s));

/// 가상 시간이 흐르는 시계로 바꿔 실행한다(`widgetTest`의 고정 시계는 300초 창을 끝내지 못한다).
void _timedWidgetTest(String name, Future<void> Function(WidgetTester) body) {
  testWidgets(name, (tester) async {
    final start = tester.binding.clock.now();
    final ticking = Clock(
      () => t0.add(tester.binding.clock.now().difference(start)),
    );
    await withClock(ticking, () async {
      await body(tester);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  });
}

void main() {
  group('상태별 알약', () {
    widgetTest('TC-AIR-057 REQ-AIR-008 첫 GET 동안 "AI 상태 확인중"(비활성)이 보인다', (
      tester,
    ) async {
      final r = AiRig();
      r.api.get([fx(aiGet('none'), delay: const Duration(seconds: 1))]);
      await _open(tester, r);
      expect(
        _text(AiReviewTestIds.feedChecking, Copy.aiPillChecking),
        findsOneWidget,
      );
      expect(isEnabled(tester, AiReviewTestIds.feedChecking), isFalse);
      await tester.pump(const Duration(seconds: 2));
      expect(byId(AiReviewTestIds.feedChecking), findsNothing);
    });

    widgetTest('TC-AIR-012 TC-AIR-057 NONE이면 "AI 피드백 받기"가 보이고 폴링하지 않는다', (
      tester,
    ) async {
      final r = AiRig();
      await _open(tester, r);
      expect(
        _text(AiReviewTestIds.feedRequestButton, Copy.aiPillRequest),
        findsOneWidget,
      );
      expect(isEnabled(tester, AiReviewTestIds.feedRequestButton), isTrue);
      await tester.pump(const Duration(seconds: 10));
      expect(r.api.getCalls(), 1);
    });

    widgetTest('TC-AIR-013 TC-AIR-057 PROCESSING이면 비활성 "AI 분석중"이다', (
      tester,
    ) async {
      final r = AiRig();
      r.api.get([fx(aiGet('processing'))]);
      await _open(tester, r);
      expect(
        _text(AiReviewTestIds.feedProcessing, Copy.aiPillProcessing),
        findsOneWidget,
      );
      expect(isEnabled(tester, AiReviewTestIds.feedProcessing), isFalse);
    });

    widgetTest('TC-AIR-014 TC-AIR-057 COMPLETED면 "AI 피드백 보기"만 있고 재요청 버튼이 없다', (
      tester,
    ) async {
      final r = AiRig();
      r.api.get([fx(aiGet('completed'))]);
      await _open(tester, r);
      expect(
        _text(AiReviewTestIds.feedResultButton, Copy.aiPillView),
        findsOneWidget,
      );
      expect(byId(AiReviewTestIds.feedRetryButton), findsNothing);
      expect(byId(AiReviewTestIds.feedRequestButton), findsNothing);
    });

    widgetTest('TC-AIR-015 TC-AIR-057 FAILED + 재요청 가능이면 "AI 피드백 재요청"이다', (
      tester,
    ) async {
      final r = AiRig();
      r.api.get([fx(aiGet('failed-can-retry'))]);
      await _open(tester, r);
      expect(
        _text(AiReviewTestIds.feedRetryButton, Copy.aiPillRetry),
        findsOneWidget,
      );
    });

    widgetTest(
      'TC-AIR-015 TC-AIR-057 TC-AIR-053 FAILED + 재요청 불가면 재요청 버튼 없이 실패 시트로 사유를 안내한다',
      (tester) async {
        final r = AiRig();
        r.api.get([fx(aiGet('failed-cannot-retry'))]);
        await _open(tester, r);
        expect(
          _text(AiReviewTestIds.feedFailedButton, Copy.aiPillFailed),
          findsOneWidget,
        );
        expect(byId(AiReviewTestIds.feedRetryButton), findsNothing);

        await tester.tap(byId(AiReviewTestIds.feedFailedButton));
        await settleSheet(tester);
        expect(byId(AiReviewTestIds.failedSheetRoot), findsOneWidget);
        expect(
          _text(AiReviewTestIds.failedSheetMessage, Copy.aiFailedNoMore),
          findsOneWidget,
        );
        expect(byId(AiReviewTestIds.failedSheetRetryButton), findsNothing);
      },
    );

    widgetTest('TC-AIR-016 지난 주제의 FAILED 실패 시트는 "오늘 올린 사진만 재요청할 수 있어요"를 안내한다', (
      tester,
    ) async {
      final r = AiRig();
      r.api.get([fx(aiGet('failed-can-retry'))]);
      await pumpAiWidget(
        tester,
        r,
        (s) => AiReviewPill(session: s),
        target: r.pastTarget,
      );
      await tester.tap(byId(AiReviewTestIds.feedFailedButton));
      await settleSheet(tester);
      expect(
        _text(AiReviewTestIds.failedSheetMessage, Copy.aiFailedPast),
        findsOneWidget,
      );
    });

    widgetTest('TC-AIR-017 대상이 없으면(남의 게시물·게스트) 알약이 없고 요청도 없다', (tester) async {
      final r = AiRig();
      addTearDown(r.session.dispose);
      await pumpScreen(
        tester,
        Scaffold(body: AiReviewPill(session: r.session)),
      );
      for (final id in [
        AiReviewTestIds.feedChecking,
        AiReviewTestIds.feedRequestButton,
        AiReviewTestIds.feedProcessing,
        AiReviewTestIds.feedResultButton,
        AiReviewTestIds.feedRetryButton,
        AiReviewTestIds.feedFailedButton,
        AiReviewTestIds.feedRecheckButton,
      ]) {
        expect(byId(id), findsNothing, reason: id);
      }
      expect(r.api.totalCalls, 0);
    });

    widgetTest('TC-AIR-017 GET 404면 알약이 사라진다', (tester) async {
      final r = AiRig();
      r.api.get([fx(aiGet('404-not-found'))]);
      await _open(tester, r);
      expect(byId(AiReviewTestIds.feedRequestButton), findsNothing);
      expect(byId(AiReviewTestIds.feedChecking), findsNothing);
    });

    widgetTest(
      'TC-AIR-040 TC-AIR-057 첫 GET이 실패하면 "AI 상태 다시 확인"이 보이고 누르면 다시 조회한다',
      (tester) async {
        final r = AiRig();
        r.api.get([...failing(aiGet('500-server-error')), fx(aiGet('none'))]);
        await _open(tester, r);
        await tester.pump(const Duration(seconds: 3));
        expect(
          _text(AiReviewTestIds.feedRecheckButton, Copy.aiPillRecheck),
          findsOneWidget,
        );
        await tester.tap(byId(AiReviewTestIds.feedRecheckButton));
        await settleUi(tester);
        expect(
          _text(AiReviewTestIds.feedRequestButton, Copy.aiPillRequest),
          findsOneWidget,
        );
      },
    );

    widgetTest('TC-AIR-023 TC-AIR-057 POST를 기다리는 동안 비활성 "AI 요청중"이 보인다', (
      tester,
    ) async {
      final r = AiRig();
      r.api.post([
        fx(aiPost('202-processing'), delay: const Duration(seconds: 2)),
      ]);
      await _open(tester, r);
      await tester.tap(byId(AiReviewTestIds.feedRequestButton));
      await settleSheet(tester);
      await tester.tap(byId(AiReviewTestIds.startSheetStartButton));
      await settleUi(tester);
      expect(
        _text(AiReviewTestIds.feedRequesting, Copy.aiPillRequesting),
        findsOneWidget,
      );
      expect(isEnabled(tester, AiReviewTestIds.feedRequesting), isFalse);
    });
  });

  group('시작 시트', () {
    widgetTest(
      'TC-AIR-020 TC-AIR-057 "AI 피드백 받기"를 누르면 시작 시트가 뜨고 닫으면 POST가 없다',
      (tester) async {
        final r = AiRig();
        await _open(tester, r);
        await tester.tap(byId(AiReviewTestIds.feedRequestButton));
        await settleSheet(tester);
        expect(byId(AiReviewTestIds.startSheetRoot), findsOneWidget);
        expect(find.text(Copy.aiStartTitle), findsOneWidget);
        for (final line in [
          Copy.aiStartLine1,
          Copy.aiStartLine2,
          Copy.aiStartLine3,
        ]) {
          expect(
            find.descendant(
              of: byId(AiReviewTestIds.startSheetDescription),
              matching: find.text(line),
            ),
            findsOneWidget,
            reason: line,
          );
        }
        expect(
          _text(AiReviewTestIds.startSheetStartButton, Copy.aiStartConfirm),
          findsOneWidget,
        );

        await tester.tap(byId(AiReviewTestIds.startSheetCloseButton));
        await settleSheet(tester);
        expect(byId(AiReviewTestIds.startSheetRoot), findsNothing);
        expect(r.api.postCalls(), 0);
      },
    );

    widgetTest('TC-AIR-020 "분석 시작하기"를 누르면 POST가 1회 나가고 "AI 분석중"이 된다', (
      tester,
    ) async {
      final r = AiRig();
      await _open(tester, r);
      await tester.tap(byId(AiReviewTestIds.feedRequestButton));
      await settleSheet(tester);
      await tester.tap(byId(AiReviewTestIds.startSheetStartButton));
      await settleSheet(tester);
      expect(r.api.postCalls(), 1);
      expect(byId(AiReviewTestIds.startSheetRoot), findsNothing);
      expect(byId(AiReviewTestIds.feedProcessing), findsOneWidget);
    });

    widgetTest('TC-AIR-020 재요청 시트의 제목은 "AI 피드백을 재요청할까요?"다', (tester) async {
      final r = AiRig();
      r.api.get([fx(aiGet('failed-can-retry'))]);
      await _open(tester, r);
      await tester.tap(byId(AiReviewTestIds.feedRetryButton));
      await settleSheet(tester);
      expect(find.text(Copy.aiStartTitleRetry), findsOneWidget);
    });

    widgetTest('TC-AIR-021 시작 시트에는 추가 동의·개인정보 체크 UI가 없다', (tester) async {
      final r = AiRig();
      await _open(tester, r);
      await tester.tap(byId(AiReviewTestIds.feedRequestButton));
      await settleSheet(tester);
      expect(find.byType(Checkbox), findsNothing);
      expect(find.byType(Switch), findsNothing);
      expect(find.byType(Radio<Object?>), findsNothing);
      expect(_allTexts(tester).where((t) => t.contains('동의')), isEmpty);
    });
  });

  group('용어 통일', () {
    widgetTest('TC-AIR-054 알약과 시트 문구에 "AI 리뷰"가 없고 "AI 피드백"으로 통일돼 있다', (
      tester,
    ) async {
      final r = AiRig();
      await _open(tester, r);
      final texts = <String>{..._allTexts(tester)};
      await tester.tap(byId(AiReviewTestIds.feedRequestButton));
      await settleSheet(tester);
      texts.addAll(_allTexts(tester));
      expect(texts, isNotEmpty);
      for (final text in texts) {
        expect(text, isNot(contains('AI 리뷰')), reason: text);
      }
    });
  });

  group('가시성', () {
    widgetTest('TC-AIR-042 앱이 백그라운드로 가면 폴링을 멈추고 돌아오면 GET부터 다시 시작한다', (
      tester,
    ) async {
      final r = AiRig();
      r.api.get([fx(aiGet('processing'))]);
      await _open(tester, r);
      await tester.pump(const Duration(seconds: 3));
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump();
      final paused = r.api.getCalls();
      await tester.pump(const Duration(seconds: 30));
      expect(r.api.getCalls(), paused);

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await settleUi(tester);
      expect(r.api.getCalls(), paused + 1);
    });

    widgetTest('TC-AIR-042 visible=false인 동안(다른 탭·덮임)에는 요청하지 않는다', (
      tester,
    ) async {
      final r = AiRig();
      r.api.get([fx(aiGet('processing'))]);
      addTearDown(r.session.dispose);
      r.session.setTarget(r.target);
      await pumpScreen(
        tester,
        Scaffold(body: AiReviewPill(session: r.session, visible: false)),
      );
      await tester.pump(const Duration(seconds: 30));
      expect(r.api.totalCalls, 0);

      await pumpScreen(
        tester,
        Scaffold(body: AiReviewPill(session: r.session)),
      );
      expect(r.api.getCalls(), 1);
    });

    widgetTest('TC-AIR-042 위젯이 사라지면 폴링이 멈춘다', (tester) async {
      final r = AiRig();
      r.api.get([fx(aiGet('processing'))]);
      await _open(tester, r);
      await tester.pumpWidget(const SizedBox.shrink());
      final before = r.api.getCalls();
      await tester.pump(const Duration(seconds: 30));
      expect(r.api.getCalls(), before);
    });
  });

  group('폴링 창 안내', () {
    _timedWidgetTest('TC-AIR-035 300초가 지나면 "AI 분석중"을 유지한 채 안내 문구를 보인다', (
      tester,
    ) async {
      final r = AiRig();
      r.api.get([fx(aiGet('processing'))]);
      await _open(tester, r);
      for (var i = 0; i < 101; i++) {
        await tester.pump(const Duration(seconds: 3));
      }
      expect(
        _text(AiReviewTestIds.feedMessage, Copy.aiPollTimeout),
        findsOneWidget,
      );
      expect(byId(AiReviewTestIds.feedProcessing), findsOneWidget);
      expect(r.api.postCalls(), 0);
    });
  });

  group('푸시 진입', () {
    widgetTest('TC-AIR-058 푸시 진입이고 COMPLETED면 결과 시트가 자동으로 열린다', (tester) async {
      final r = AiRig(openSheetOnEntry: true);
      r.api.get([fx(aiGet('completed'))]);
      await _open(tester, r);
      await settleSheet(tester);
      expect(byId(AiReviewTestIds.resultSheetRoot), findsOneWidget);
    });

    widgetTest('TC-AIR-058 푸시 진입이고 FAILED면 실패 시트가 자동으로 열린다', (tester) async {
      final r = AiRig(openSheetOnEntry: true);
      r.api.get([fx(aiGet('failed-cannot-retry'))]);
      await _open(tester, r);
      await settleSheet(tester);
      expect(byId(AiReviewTestIds.failedSheetRoot), findsOneWidget);
    });

    widgetTest('TC-AIR-058 푸시 진입이어도 PROCESSING이면 시트 없이 알약만 보인다', (
      tester,
    ) async {
      final r = AiRig(openSheetOnEntry: true);
      r.api.get([fx(aiGet('processing'))]);
      await _open(tester, r);
      await settleSheet(tester);
      expect(byId(AiReviewTestIds.resultSheetRoot), findsNothing);
      expect(byId(AiReviewTestIds.failedSheetRoot), findsNothing);
      expect(byId(AiReviewTestIds.feedProcessing), findsOneWidget);
    });
  });
}
