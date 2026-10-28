import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/ai_review/domain/ai_review_state.dart';
import 'package:chalkak/features/ai_review/domain/ai_review_target.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/ai_review_fakes.dart';
import '../../../support/fake_async_helpers.dart';

Duration _sec(int s) => Duration(seconds: s);

void main() {
  group('재진입: 상세 vs 홈', () {
    fakeTest('TC-AIR-019 상세로 다시 들어오면 완료 결과도 GET으로 갱신하고 자동 요청하지 않는다', (async) {
      final r = AiRig();
      r.api.get([fx(aiGet('completed'))]);
      r.show(async);
      r.session.onHidden();
      r.session.onShown();
      r.pass(async);
      expect(r.api.getCalls(), 2);
      expect(r.api.postCalls(), 0);
      expect(r.state.pill, AiPill.view);
    });

    fakeTest('TC-AIR-018 홈에 돌아오면 같은 게시물의 완료 결과를 다시 조회하지 않고 유지한다', (async) {
      final r = AiRig(surface: AiReviewSurface.home);
      r.api.get([fx(aiGet('completed'))]);
      r.show(async);
      r.session.onHidden();
      r.session.onShown();
      r.pass(async);
      expect(r.api.getCalls(), 1);
      expect(r.state.pill, AiPill.view);
    });

    fakeTest('TC-AIR-018 홈에 돌아왔을 때 처리 중이었다면 결과를 표시한 채 조회를 재개한다', (async) {
      final r = AiRig(surface: AiReviewSurface.home);
      r.api.get([
        fx(aiGet('processing')),
        fx(aiGet('processing'), delay: _sec(2)),
        fx(aiGet('completed')),
      ]);
      r.show(async, wait: Duration.zero);
      r.session.onHidden();
      r.session.onShown();
      r.pass(async, const Duration(milliseconds: 500));
      expect(r.state.pill, AiPill.processing, reason: '확인중으로 깜빡이지 않는다');
      expect(r.api.getCalls(), 2);
      r.pass(async, _sec(10));
      expect(r.state.pill, AiPill.view);
    });

    fakeTest('TC-AIR-018 게시물이 달라지면 이전 완료 결과를 지우고 새 결과를 조회한다', (async) {
      final r = AiRig(surface: AiReviewSurface.home);
      r.api.get([fx(aiGet('completed'))]);
      r.api.get([fx(aiGet('none'))], postId: aiPostB);
      r.show(async);
      expect(r.state.pill, AiPill.view);
      r.session.onHidden();
      r.session.setTarget(r.targetB);
      expect(r.state.review, isNull);
      expect(r.state.pill, AiPill.hidden);
      r.session.onShown();
      r.pass(async);
      expect(r.api.getCalls(aiPostB), 1);
      expect(r.state.pill, AiPill.request);
    });

    fakeTest('REQ-AIR-050 대상 설정과 표시가 겹쳐 불려도 GET은 한 번이다', (async) {
      final r = AiRig();
      r.session.onShown();
      r.session.setTarget(r.target);
      r.pass(async);
      expect(r.api.getCalls(), 1);
      r.session.setTarget(r.targetB);
      r.session.onShown();
      r.pass(async);
      expect(r.api.getCalls(aiPostB), 1);
    });
  });

  group('푸시 진입: 시트 자동 오픈', () {
    fakeTest('TC-AIR-058 최신 GET이 COMPLETED면 결과 시트를 한 번 자동으로 연다', (async) {
      final r = AiRig(openSheetOnEntry: true);
      r.api.get([fx(aiGet('completed'))]);
      r.show(async);
      expect(r.state.sheet, isA<AiResultSheet>());
      expect(r.api.postCalls(), 0);
    });

    fakeTest('TC-AIR-058 FAILED면 실패 시트를 자동으로 연다(재요청 불가 사유 포함)', (async) {
      final r = AiRig(openSheetOnEntry: true);
      r.api.get([fx(aiGet('failed-cannot-retry'))]);
      r.show(async);
      expect(
        r.state.sheet,
        isA<AiFailedSheet>().having(
          (s) => s.reason,
          'reason',
          Copy.aiFailedNoMore,
        ),
      );
    });

    fakeTest('TC-AIR-058 PROCESSING·NONE이면 시트를 열지 않고 알약만 보인다', (async) {
      final processing = AiRig(openSheetOnEntry: true);
      processing.api.get([fx(aiGet('processing'))]);
      processing.show(async);
      expect(processing.state.sheet, isNull);
      expect(processing.state.pill, AiPill.processing);

      final none = AiRig(openSheetOnEntry: true);
      none.show(async);
      expect(none.state.sheet, isNull);
      expect(none.state.pill, AiPill.request);
    });

    fakeTest('TC-AIR-058 REQ-AIR-047 닫은 뒤 다시 보여도 같은 진입에서는 다시 열지 않는다', (async) {
      final r = AiRig(openSheetOnEntry: true);
      r.api.get([fx(aiGet('completed'))]);
      r.show(async);
      expect(r.state.sheet, isA<AiResultSheet>());
      r.session.onSheetDismissed();
      r.session.onHidden();
      r.session.onShown();
      r.pass(async);
      expect(r.state.sheet, isNull);
    });

    fakeTest('TC-AIR-058 일반 진입(푸시가 아님)에서는 자동으로 열지 않는다', (async) {
      final r = AiRig();
      r.api.get([fx(aiGet('completed'))]);
      r.show(async);
      expect(r.state.sheet, isNull);
    });
  });

  group('결과 시트와 기준 다이얼로그', () {
    fakeTest('TC-AIR-052 REQ-AIR-041 결과 시트에서만 기준 설명 다이얼로그를 열고 닫을 수 있다', (
      async,
    ) {
      final r = AiRig();
      r.api.get([fx(aiGet('completed'))]);
      r.show(async);
      r.session.onCriteriaHelpPressed();
      expect(r.state.criteriaDialogOpen, isFalse);
      r.session.onPillPressed();
      r.session.onCriteriaHelpPressed();
      expect(r.state.criteriaDialogOpen, isTrue);
      r.session.onCriteriaHelpDismissed();
      expect(r.state.criteriaDialogOpen, isFalse);
      expect(r.state.sheet, isA<AiResultSheet>());
      r.session.onCriteriaHelpPressed();
      r.session.onSheetDismissed();
      expect(r.state.criteriaDialogOpen, isFalse);
      expect(r.state.sheet, isNull);
    });
  });
}
