import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/ai_review/domain/ai_review_state.dart';
import 'package:chalkak/features/ai_review/domain/ai_review_target.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/ai_review_fakes.dart';
import '../../../support/auth_fakes.dart';
import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show reauth, sessionAt;

AiRig _noneRig({AiReviewSurface surface = AiReviewSurface.feed}) =>
    AiRig(surface: surface);

void main() {
  group('시작 시트와 POST', () {
    fakeTest('TC-AIR-020 NONE 알약을 누르면 시작 시트가 열리고 닫으면 POST가 0건이다', (async) {
      final r = _noneRig();
      r.show(async);
      r.session.onPillPressed();
      expect(
        r.state.sheet,
        isA<AiStartSheet>().having((s) => s.retry, 'retry', isFalse),
      );
      r.session.onSheetDismissed();
      r.pass(async, const Duration(seconds: 10));
      expect(r.state.sheet, isNull);
      expect(r.api.postCalls(), 0);
    });

    fakeTest('TC-AIR-020 "분석 시작하기"를 확정하면 POST가 1회 나가고 시트가 닫힌다', (async) {
      final r = _noneRig();
      r.show(async);
      r.request(async);
      expect(r.api.postCalls(), 1);
      expect(r.state.sheet, isNull);
    });

    fakeTest('TC-AIR-020 시트 없이는 확정해도 POST를 보내지 않는다', (async) {
      final r = _noneRig();
      r.show(async);
      r.session.onStartConfirmed();
      r.pass(async);
      expect(r.api.postCalls(), 0);
    });

    fakeTest('TC-AIR-020 REQ-AIR-036 홈의 실패 재요청은 시트 없이 바로 POST한다', (async) {
      final r = _noneRig(surface: AiReviewSurface.home);
      r.api.get([fx(aiGet('failed-can-retry'))]);
      r.show(async);
      expect(r.state.pill, AiPill.retry);
      r.session.onPillPressed();
      expect(r.state.sheet, isNull);
      r.pass(async);
      expect(r.api.postCalls(), 1);
    });

    fakeTest('TC-AIR-020 홈의 NONE은 시작 시트를 거친다', (async) {
      final r = _noneRig(surface: AiReviewSurface.home);
      r.show(async);
      r.session.onPillPressed();
      expect(r.state.sheet, isA<AiStartSheet>());
      expect(r.api.postCalls(), 0);
    });
  });

  group('POST 응답 해석', () {
    fakeTest('TC-AIR-022 202 PROCESSING이면 분석중이 되고 3초 뒤 폴링 GET이 나간다', (async) {
      final r = _noneRig();
      r.show(async);
      final getsBefore = r.api.getCalls();
      r.request(async);
      expect(r.state.pill, AiPill.processing);
      expect(r.api.getCalls(), getsBefore);
      r.pass(async, const Duration(seconds: 3));
      expect(r.api.getCalls(), getsBefore + 1);
    });

    fakeTest('TC-AIR-023 REQ-AIR-010 응답을 기다리는 동안 "AI 요청중"이고 연타해도 POST는 1건이다', (
      async,
    ) {
      final r = _noneRig();
      r.api.post([
        fx(aiPost('202-processing'), delay: const Duration(seconds: 5)),
      ]);
      r.show(async);
      // POST가 받아들여졌으니 이후 폴링 GET은 서버 상태대로 PROCESSING이다.
      r.api.get([fx(aiGet('processing'))]);
      r.session.onPillPressed();
      r.session.onStartConfirmed();
      r.session.onStartConfirmed();
      r.pass(async, const Duration(seconds: 1));
      expect(r.state.pill, AiPill.requesting);
      expect(r.state.pill.label, Copy.aiPillRequesting);
      expect(r.state.pill.enabled, isFalse);
      r.session.onPillPressed();
      r.session.onStartConfirmed();
      r.pass(async, const Duration(seconds: 10));
      expect(r.api.postCalls(), 1);
      expect(r.state.pill, AiPill.processing);
    });

    fakeTest('TC-AIR-024 이미 완료된 리뷰의 200 COMPLETED는 그대로 보이고 폴링·자동 시트가 없다', (
      async,
    ) {
      final r = _noneRig();
      r.api.post([fx(aiPost('200-completed'))]);
      r.show(async);
      r.request(async);
      r.pass(async, const Duration(seconds: 20));
      expect(r.state.pill, AiPill.view);
      expect(r.state.sheet, isNull);
      expect(r.api.getCalls(), 1);
    });

    fakeTest('REQ-AIR-022 POST 응답이 FAILED면 실패 상태로 바꾸고 시트는 열지 않는다', (async) {
      final r = _noneRig();
      r.api.post([fx(aiGet('failed-cannot-retry'))]);
      r.show(async);
      r.request(async);
      expect(r.state.pill, AiPill.failed);
      expect(r.state.sheet, isNull);
      expect(r.api.postCalls(), 1);
    });

    fakeTest('TC-AIR-025 재요청 폴링 창은 이번 POST 시각부터 300초다(이전 requestedAt 무관)', (
      async,
    ) {
      final r = _noneRig();
      r.api.get([
        fx(aiGet('failed-can-retry')),
        fx(aiGet('processing-old-requested-at')),
      ]);
      r.show(async, wait: Duration.zero);
      r.pass(async, const Duration(seconds: 100));
      r.session.onPillPressed();
      expect(
        r.state.sheet,
        isA<AiStartSheet>().having((s) => s.retry, 'retry', isTrue),
      );
      r.session.onStartConfirmed();
      r.pass(async, Duration.zero);
      expect(r.api.postOffsets(), [const Duration(seconds: 100)]);
      expect(r.state.pill, AiPill.processing);

      r.pass(async, const Duration(seconds: 299));
      expect(r.state.notice, isNull);
      expect(r.api.getOffsets().last, const Duration(seconds: 397));
      r.pass(async, const Duration(seconds: 1));
      expect(r.state.notice, Copy.aiPollTimeout);
      expect(r.api.getOffsets().last, const Duration(seconds: 397));
      expect(r.api.postCalls(), 1);
    });
  });

  group('POST 오류', () {
    fakeTest(
      'TC-AIR-026 400 한도 초과는 서버 message를 그대로 보이고 이전 단계를 유지하며 다시 보내지 않는다',
      (async) {
        final r = _noneRig();
        r.api.get([fx(aiGet('failed-can-retry'))]);
        r.api.post([fx(aiPost('400-limit-reached'))]);
        r.show(async);
        r.session.onPillPressed();
        r.session.onStartConfirmed();
        r.pass(async, const Duration(seconds: 30));
        expect(r.toast.messages, ['더 이상 AI 리뷰를 다시 요청할 수 없습니다.']);
        expect(r.state.pill, AiPill.retry);
        expect(r.api.postCalls(), 1);
      },
    );

    fakeTest('TC-AIR-026 400 "지금은 요청할 수 없습니다"도 같다', (async) {
      final r = _noneRig();
      r.api.post([fx(aiPost('400-disabled'))]);
      r.show(async);
      r.request(async);
      r.pass(async, const Duration(seconds: 30));
      expect(r.toast.messages, ['지금은 AI 리뷰를 요청할 수 없습니다.']);
      expect(r.state.pill, AiPill.request);
      expect(r.api.postCalls(), 1);
    });

    fakeTest('TC-AIR-027 정지 회원의 POST 403은 제한 문구를 알리고 재요청하지 않으며 GET은 정상이다', (
      async,
    ) {
      final r = _noneRig();
      r.api.post([fx(aiPost('403-banned'))]);
      r.show(async);
      expect(r.state.pill, AiPill.request);
      r.request(async);
      r.pass(async, const Duration(seconds: 30));
      expect(r.toast.messages, [Copy.aiErrorBanned]);
      expect(r.api.postCalls(), 1);
      expect(r.state.pill, AiPill.request);

      final completed = _noneRig();
      completed.api.get([fx(aiGet('completed'))]);
      completed.show(async);
      expect(completed.state.pill, AiPill.view);
    });

    fakeTest('TC-AIR-028 POST 404면 조회 불가 문구를 알리고 알약을 숨기며 더 조회하지 않는다', (async) {
      final r = _noneRig();
      r.api.post([fx(aiPost('404-not-found'))]);
      r.show(async);
      r.request(async);
      r.pass(async, const Duration(seconds: 30));
      expect(r.toast.messages, [Copy.aiErrorNotFound]);
      expect(r.state.pill, AiPill.hidden);
      expect(r.api.getCalls(), 1);
      expect(r.api.postCalls(), 1);
    });

    fakeTest('TC-AIR-029 POST 401을 갱신할 수 없으면 로그인 문구를 알리고 요청을 멈춘다', (async) {
      final r = AiRig(authSession: sessionAt());
      r.http.adapter.on('POST', AuthHttpHarness.refreshPath, [reauth()]);
      r.api.post([fx(aiPost('401-unauthorized'))]);
      r.show(async);
      r.request(async, wait: const Duration(seconds: 1));
      r.pass(async, const Duration(seconds: 30));
      expect(r.toast.messages, [Copy.aiErrorLogin]);
      expect(r.api.postCalls(), 1);
      expect(r.api.getCalls(), 1);
    });

    fakeTest(
      'TC-AIR-030 POST 응답이 유실되면 네트워크 문구를 알리고 GET으로 동기화하며 POST를 반복하지 않는다',
      (async) {
        final r = _noneRig();
        r.api.post([fx(aiPost('timeout'))]);
        r.show(async);
        r.api.get([fx(aiGet('processing'))]);
        final getsBefore = r.api.getCalls();
        r.request(async, wait: const Duration(seconds: 11));
        expect(r.toast.messages, [Copy.aiErrorNetwork]);
        expect(r.api.getCalls(), getsBefore + 1);
        expect(r.state.pill, AiPill.processing);
        r.pass(async, const Duration(seconds: 60));
        expect(r.api.postCalls(), 1);
      },
    );

    fakeTest('TC-AIR-031 POST 500은 자동 재시도 없이 오류 문구를 보이고 이전 단계를 유지한다', (async) {
      final r = _noneRig();
      r.api.post([fx(aiPost('500-server-error'))]);
      r.show(async);
      r.request(async, wait: const Duration(seconds: 5));
      r.pass(async, const Duration(seconds: 30));
      expect(r.toast.messages, [Copy.aiErrorLoad]);
      expect(r.api.postCalls(), 1);
      expect(r.state.pill, AiPill.request);
    });

    fakeTest('REQ-AIR-024 POST 409(방어적)는 문구 없이 GET으로 다시 조회한다', (async) {
      final r = _noneRig();
      r.api.post([
        FakeResponse.json(409, {'errorCode': 'BUSINESS_ERROR', 'message': 'x'}),
      ]);
      r.show(async);
      final getsBefore = r.api.getCalls();
      r.api.get([fx(aiGet('processing'))]);
      r.request(async, wait: const Duration(seconds: 1));
      expect(r.toast.messages, isEmpty);
      expect(r.api.getCalls(), greaterThan(getsBefore));
      expect(r.state.pill, AiPill.processing);
      expect(r.api.postCalls(), 1);
    });
  });
}
