import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/ai_review/domain/ai_review_models.dart';
import 'package:chalkak/features/ai_review/domain/ai_review_state.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/ai_review_fakes.dart';
import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show sessionAt, settle;

/// KST 2026-10-27 23:59:59(UTC 14:59:59)에서 시작하는 가상 시계. 세션 토큰도 그 시각 기준이다.
final DateTime _beforeMidnight = DateTime.utc(2026, 10, 27, 14, 59, 59);

void _fakeTestAtMidnight(String name, void Function(FakeAsync async) body) {
  test(name, () {
    fakeAsync((async) {
      body(async);
      settle(async);
    }, initialTime: _beforeMidnight);
  });
}

void main() {
  group('진입과 첫 상태', () {
    fakeTest('TC-AIR-011 REQ-AIR-002 진입하면 GET만 보내고 POST는 자동으로 보내지 않는다', (
      async,
    ) {
      final r = AiRig();
      r.show(async, wait: const Duration(seconds: 20));
      expect(r.api.getCalls(), 1);
      expect(r.api.postCalls(), 0);
    });

    fakeTest(
      'TC-AIR-017 REQ-AIR-001 REQ-AIR-007 대상이 없으면(남의 게시물·게스트) 알약도 요청도 없다',
      (async) {
        final r = AiRig();
        r.session.setTarget(null);
        r.session.onShown();
        r.pass(async, const Duration(seconds: 20));
        expect(r.state.pill, AiPill.hidden);
        expect(r.api.totalCalls, 0);
        r.session.onPillPressed();
        expect(r.state.sheet, isNull);
      },
    );

    fakeTest('REQ-AIR-008 첫 GET을 기다리는 동안 비활성 "AI 상태 확인중"이다', (async) {
      final r = AiRig();
      r.api.get([fx(aiGet('none'), delay: const Duration(seconds: 2))]);
      r.show(async, wait: const Duration(milliseconds: 500));
      expect(r.state.pill, AiPill.checking);
      expect(r.state.pill.label, Copy.aiPillChecking);
      expect(r.state.pill.enabled, isFalse);
      r.pass(async, const Duration(seconds: 3));
      expect(r.state.pill, AiPill.request);
    });

    fakeTest('TC-AIR-012 NONE이면 "AI 피드백 받기"이고 폴링하지 않는다', (async) {
      final r = AiRig();
      r.show(async, wait: const Duration(seconds: 30));
      expect(r.state.pill, AiPill.request);
      expect(r.state.pill.label, Copy.aiPillRequest);
      expect(r.state.pill.enabled, isTrue);
      expect(r.api.getCalls(), 1);
    });

    fakeTest('TC-AIR-013 PROCESSING이면 비활성 "AI 분석중"이고 폴링을 시작한다', (async) {
      final r = AiRig();
      r.api.get([fx(aiGet('processing'))]);
      r.show(async, wait: const Duration(milliseconds: 100));
      expect(r.state.pill, AiPill.processing);
      expect(r.state.pill.label, Copy.aiPillProcessing);
      expect(r.state.pill.enabled, isFalse);
      r.pass(async, const Duration(seconds: 3));
      expect(r.api.getCalls(), 2);
    });

    fakeTest('TC-AIR-014 COMPLETED면 "AI 피드백 보기"만 있고 폴링·재요청이 없다', (async) {
      final r = AiRig();
      r.api.get([fx(aiGet('completed'))]);
      r.show(async, wait: const Duration(seconds: 30));
      expect(r.state.pill, AiPill.view);
      expect(r.state.pill.label, Copy.aiPillView);
      expect(r.api.getCalls(), 1);
      r.session.onPillPressed();
      expect(r.state.sheet, isA<AiResultSheet>());
      expect(r.state.sheet, isNot(isA<AiStartSheet>()));
    });
  });

  group('실패 상태', () {
    fakeTest(
      'TC-AIR-015 FAILED + canRequestAgain=true면 "AI 피드백 재요청"이고 누르면 재요청 시트가 열린다',
      (async) {
        final r = AiRig();
        r.api.get([fx(aiGet('failed-can-retry'))]);
        r.show(async);
        expect(r.state.pill, AiPill.retry);
        expect(r.state.pill.label, Copy.aiPillRetry);
        r.session.onPillPressed();
        expect(
          r.state.sheet,
          isA<AiStartSheet>().having((s) => s.retry, 'retry', isTrue),
        );
        expect(r.api.postCalls(), 0);
      },
    );

    fakeTest(
      'TC-AIR-015 FAILED + canRequestAgain=false면 재요청 없이 "AI 피드백 실패"이고 실패 시트에 사유가 있다',
      (async) {
        final r = AiRig();
        r.api.get([fx(aiGet('failed-cannot-retry'))]);
        r.show(async);
        expect(r.state.pill, AiPill.failed);
        expect(r.state.pill.label, Copy.aiPillFailed);
        r.session.onPillPressed();
        expect(
          r.state.sheet,
          isA<AiFailedSheet>().having(
            (s) => s.reason,
            'reason',
            Copy.aiFailedNoMore,
          ),
        );
        r.request(async);
        expect(r.api.postCalls(), 0);
      },
    );

    fakeTest(
      'TC-AIR-015 REQ-AIR-049 재요청 가능 여부는 canRequestAgain만 본다(필드 없음 = false)',
      (async) {
        final r = AiRig();
        r.api.get([fx(aiGet('missing-can-request-again'))]);
        r.show(async);
        expect(r.state.pill, AiPill.failed);
      },
    );

    fakeTest('REQ-AIR-017 FAILED가 확인돼도 자동으로 재요청하지 않는다', (async) {
      final r = AiRig();
      r.api.get([fx(aiGet('failed-can-retry'))]);
      r.show(async, wait: const Duration(seconds: 30));
      expect(r.api.postCalls(), 0);
      expect(r.api.getCalls(), 1);
    });
  });

  group('지난 주제의 내 게시물', () {
    fakeTest('TC-AIR-016 지난 주제의 NONE이면 알약을 숨기고 요청하지 않는다', (async) {
      final r = AiRig();
      r.show(async, target: r.pastTarget);
      expect(r.state.pill, AiPill.hidden);
      r.session.onPillPressed();
      expect(r.state.sheet, isNull);
      expect(r.api.postCalls(), 0);
    });

    fakeTest('TC-AIR-016 지난 주제의 FAILED는 재요청 가능이어도 실패 알약이고 사유는 "오늘 올린 사진만"이다', (
      async,
    ) {
      final r = AiRig();
      r.api.get([fx(aiGet('failed-can-retry'))]);
      r.show(async, target: r.pastTarget);
      expect(r.state.pill, AiPill.failed);
      r.session.onPillPressed();
      expect(
        r.state.sheet,
        isA<AiFailedSheet>().having(
          (s) => s.reason,
          'reason',
          Copy.aiFailedPast,
        ),
      );
      r.request(async);
      expect(r.api.postCalls(), 0);
    });

    fakeTest('TC-AIR-016 지난 주제도 진행 중·완료 상태는 보여 준다', (async) {
      final processing = AiRig();
      processing.api.get([fx(aiGet('processing'))]);
      processing.show(async, target: processing.pastTarget);
      expect(processing.state.pill, AiPill.processing);

      final completed = AiRig();
      completed.api.get([fx(aiGet('completed'))]);
      completed.show(async, target: completed.pastTarget);
      expect(completed.state.pill, AiPill.view);
    });
  });

  group('조회 오류', () {
    fakeTest('TC-AIR-017 REQ-AIR-005 GET 404면 메시지 없이 숨기고 더 조회하지 않는다', (async) {
      final r = AiRig();
      r.api.get([fx(aiGet('404-not-found'))]);
      r.show(async, wait: const Duration(seconds: 30));
      expect(r.state.pill, AiPill.hidden);
      expect(r.toast.messages, isEmpty);
      expect(r.api.getCalls(), 1);
    });

    fakeTest(
      'TC-AIR-040 REQ-AIR-016 첫 GET이 5xx로 실패하면 "AI 상태 다시 확인"과 오류 문구를 보이고 누르면 다시 조회한다',
      (async) {
        final r = AiRig();
        r.api.get([...failing(aiGet('500-server-error')), fx(aiGet('none'))]);
        r.show(async, wait: const Duration(seconds: 5));
        expect(r.state.pill, AiPill.recheck);
        expect(r.state.pill.label, Copy.aiPillRecheck);
        expect(r.toast.messages, [Copy.aiErrorLoad]);
        final before = r.api.getCalls();
        r.session.onPillPressed();
        r.pass(async, const Duration(seconds: 3));
        expect(r.api.getCalls(), before + 1);
        expect(r.state.pill, AiPill.request);
        expect(r.api.postCalls(), 0);
      },
    );

    fakeTest('TC-AIR-040 첫 GET이 연결 오류면 네트워크 문구를 알린다', (async) {
      final r = AiRig();
      r.api.get(List.filled(3, const FakeResponse.fault(FakeFault.disconnect)));
      r.show(async, wait: const Duration(seconds: 5));
      expect(r.state.pill, AiPill.recheck);
      expect(r.toast.messages, [Copy.aiErrorNetwork]);
    });

    fakeTest(
      'TC-AIR-004 REQ-AIR-044 첫 GET이 잘못된 응답이면 "정보를 불러오지 못했어요"와 다시 확인이다',
      (async) {
        final r = AiRig();
        r.api.get([fx(aiGet('completed-no-result'))]);
        r.show(async);
        expect(r.state.pill, AiPill.recheck);
        expect(r.toast.messages, [Copy.aiErrorLoad]);
        expect(r.state.review, isNull);
      },
    );

    fakeTest('REQ-AIR-044 이미 확인한 상태가 있으면 잘못된 응답이 와도 그 상태를 유지한다', (async) {
      final r = AiRig();
      r.api.get([fx(aiGet('completed')), fx(aiGet('completed-no-result'))]);
      r.show(async);
      expect(r.state.pill, AiPill.view);
      r.session.onShown();
      r.pass(async);
      expect(r.state.pill, AiPill.view);
      expect(r.state.review!.status, AiReviewStatus.completed);
      expect(r.toast.messages, [Copy.aiErrorLoad]);
    });
  });

  group('KST 자정', () {
    _fakeTestAtMidnight(
      'TC-AIR-045 23:59:59에는 요청 버튼이 보이고 00:00:00에는 숨고 POST를 보내지 않는다',
      (async) {
        final r = AiRig(authSession: sessionAt(now: _beforeMidnight));
        r.show(async, wait: Duration.zero);
        expect(r.state.pill, AiPill.request);
        r.session.onPillPressed();
        expect(r.state.sheet, isA<AiStartSheet>());

        // 시작 시트를 연 채 자정이 지난다.
        r.pass(async, const Duration(seconds: 1));
        r.session.onStartConfirmed();
        r.pass(async, const Duration(seconds: 1));
        expect(r.api.postCalls(), 0);
        expect(r.state.sheet, isNull);
        expect(r.state.pill, AiPill.hidden);
      },
    );

    _fakeTestAtMidnight('TC-AIR-045 자정 뒤에는 알약을 눌러도 시트가 열리지 않는다', (async) {
      final r = AiRig(authSession: sessionAt(now: _beforeMidnight));
      r.show(async, wait: Duration.zero);
      r.pass(async, const Duration(seconds: 2));
      r.session.onPillPressed();
      expect(r.state.sheet, isNull);
      expect(r.state.pill, AiPill.hidden);
      expect(r.api.postCalls(), 0);
    });

    _fakeTestAtMidnight('TC-AIR-045 이미 진행 중인 리뷰의 결과 조회는 자정 뒤에도 계속된다', (async) {
      final r = AiRig(authSession: sessionAt(now: _beforeMidnight));
      r.api.get([
        fx(aiGet('processing')),
        fx(aiGet('processing')),
        fx(aiGet('completed')),
      ]);
      r.show(async, wait: Duration.zero);
      r.pass(async, const Duration(seconds: 10));
      expect(r.state.pill, AiPill.view);
    });
  });
}
