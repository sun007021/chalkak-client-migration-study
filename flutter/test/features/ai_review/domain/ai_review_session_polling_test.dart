import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/ai_review/domain/ai_review_state.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/ai_review_fakes.dart';
import '../../../support/auth_fakes.dart';
import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show reauth, sessionAt;

const _s3 = Duration(seconds: 3);

Duration _sec(int s) => Duration(seconds: s);

/// 진행 중(PROCESSING)으로 진입한 리그. 첫 GET은 0초에 나간다.
AiRig _processingRig() {
  final r = AiRig();
  r.api.get([fx(aiGet('processing'))]);
  return r;
}

void main() {
  group('간격: 3초', () {
    fakeTest('TC-AIR-032 POST 202 직후 2.9초에는 GET이 0건이고 3.0초에 1건이다', (async) {
      final r = AiRig();
      r.show(async);
      final before = r.api.getCalls();
      r.request(async);
      r.pass(async, const Duration(milliseconds: 2900));
      expect(r.api.getCalls(), before);
      r.pass(async, const Duration(milliseconds: 100));
      expect(r.api.getCalls(), before + 1);
    });

    fakeTest('TC-AIR-033 PROCESSING이 이어지면 3.0, 6.0, 9.0초에 한 번씩 GET이 나간다', (
      async,
    ) {
      final r = _processingRig();
      r.show(async, wait: Duration.zero);
      r.pass(async, _sec(10));
      expect(r.api.getOffsets(), [_sec(0), _sec(3), _sec(6), _sec(9)]);
    });

    fakeTest('TC-AIR-033 응답이 3초보다 늦어도 동시에 두 GET이 진행되지 않는다', (async) {
      final r = AiRig();
      r.api.get([fx(aiGet('processing'), delay: _sec(4))]);
      r.show(async, wait: Duration.zero);
      r.pass(async, _sec(40));
      final offsets = r.api.getOffsets();
      expect(offsets.length, greaterThan(3));
      for (var i = 1; i < offsets.length; i++) {
        // 이전 응답(4초 지연) 뒤에야 다음 요청이 나간다.
        expect(
          offsets[i] - offsets[i - 1],
          greaterThanOrEqualTo(_sec(4) + _s3),
        );
      }
    });
  });

  group('창: 300초', () {
    fakeTest('TC-AIR-034 진입으로 시작한 폴링의 창은 진입 시각부터이고 서버 requestedAt은 기준이 아니다', (
      async,
    ) {
      final r = AiRig();
      r.api.get([fx(aiGet('processing-old-requested-at'))]);
      r.show(async, wait: Duration.zero);
      r.pass(async, _s3);
      expect(r.state.pill, AiPill.processing);
      expect(r.state.notice, isNull);
      expect(r.api.getCalls(), 2);
      r.pass(async, _sec(296));
      expect(r.state.notice, isNull);
      r.pass(async, _sec(1));
      expect(r.state.notice, Copy.aiPollTimeout);
    });

    fakeTest(
      'TC-AIR-035 299.999초까지 폴링하고 300.000초에 GET 없이 멈춰 안내를 보인다(POST 0건)',
      (async) {
        final r = _processingRig();
        r.show(async, wait: Duration.zero);
        r.pass(async, const Duration(milliseconds: 299999));
        expect(r.state.notice, isNull);
        expect(r.api.getOffsets(), [
          _sec(0),
          for (var s = 3; s <= 297; s += 3) _sec(s),
        ]);
        r.pass(async, const Duration(milliseconds: 1));
        expect(r.state.notice, Copy.aiPollTimeout);
        expect(r.state.pill, AiPill.processing);
        expect(r.api.getCalls(), 100);
        r.pass(async, _sec(60));
        expect(r.api.getCalls(), 100);
        expect(r.api.postCalls(), 0);
      },
    );

    fakeTest('TC-AIR-036 창이 끝난 뒤 재진입하면 GET부터 새 300초 창이 열리고 POST는 없다', (async) {
      final r = _processingRig();
      r.show(async, wait: Duration.zero);
      r.pass(async, _sec(310));
      expect(r.state.notice, Copy.aiPollTimeout);
      final before = r.api.getCalls();
      r.session.onHidden();
      r.session.onShown();
      r.pass(async, Duration.zero);
      expect(r.state.notice, isNull);
      expect(r.api.getCalls(), before + 1);
      r.pass(async, _s3);
      expect(r.api.getCalls(), before + 2);
      r.pass(async, _sec(297));
      expect(r.state.notice, Copy.aiPollTimeout);
      expect(r.api.getOffsets().last, _sec(310 + 297));
      expect(r.api.postCalls(), 0);
    });
  });

  group('종료 조건', () {
    fakeTest(
      'TC-AIR-038 PROCESSING이 이어지는 동안 화면은 바뀌지 않고 COMPLETED가 오면 폴링을 멈춘다',
      (async) {
        final r = AiRig();
        r.api.get([
          fx(aiGet('processing')),
          fx(aiGet('processing')),
          fx(aiGet('completed')),
        ]);
        r.show(async, wait: Duration.zero);
        r.pass(async, _s3);
        expect(r.state.pill, AiPill.processing);
        expect(r.state.notice, isNull);
        r.pass(async, _s3);
        expect(r.state.pill, AiPill.view);
        r.pass(async, _sec(60));
        expect(r.api.getCalls(), 3);
      },
    );

    fakeTest('TC-AIR-038 FAILED가 오면 폴링을 멈추고 실패 알약을 보인다', (async) {
      final r = AiRig();
      r.api.get([fx(aiGet('processing')), fx(aiGet('failed-cannot-retry'))]);
      r.show(async, wait: Duration.zero);
      r.pass(async, _sec(60));
      expect(r.state.pill, AiPill.failed);
      expect(r.api.getCalls(), 2);
    });
  });

  group('폴링 중 오류', () {
    fakeTest(
      'TC-AIR-039 REQ-AIR-029 5xx가 이어져도 계속 폴링하고 오류 문구는 한 번만 보이며 복구되면 완료를 표시한다',
      (async) {
        final r = AiRig();
        r.api.get([
          fx(aiGet('processing')),
          ...failing(aiGet('500-server-error')),
          ...failing(aiGet('500-server-error')),
          fx(aiGet('completed')),
        ]);
        r.show(async, wait: Duration.zero);
        r.pass(async, _sec(60));
        expect(r.state.pill, AiPill.view);
        expect(r.toast.messages, [Copy.aiErrorLoad]);
      },
    );

    fakeTest('REQ-AIR-029 폴링 중 연결 오류는 네트워크 문구를 한 번만 알린다', (async) {
      final r = AiRig();
      r.api.get([
        fx(aiGet('processing')),
        ...List.filled(6, const FakeResponse.fault(FakeFault.disconnect)),
        fx(aiGet('completed')),
      ]);
      r.show(async, wait: Duration.zero);
      r.pass(async, _sec(60));
      expect(r.toast.messages, [Copy.aiErrorNetwork]);
      expect(r.state.pill, AiPill.view);
    });

    fakeTest('TC-AIR-041 REQ-AIR-030 폴링 중 GET 404면 메시지 없이 숨기고 추가 조회를 막는다', (
      async,
    ) {
      final r = AiRig();
      r.api.get([fx(aiGet('processing')), fx(aiGet('404-not-found'))]);
      r.show(async, wait: Duration.zero);
      r.pass(async, _sec(60));
      expect(r.state.pill, AiPill.hidden);
      expect(r.toast.messages, isEmpty);
      expect(r.api.getCalls(), 2);
    });

    fakeTest('TC-AIR-029 REQ-AIR-030 폴링 중 401을 갱신할 수 없으면 폴링을 멈추고 로그인 문구를 알린다', (
      async,
    ) {
      final r = AiRig(authSession: sessionAt());
      r.http.adapter.on('POST', AuthHttpHarness.refreshPath, [reauth()]);
      r.api.get([
        fx(aiGet('processing')), // GET 전용 401 fixture가 없어 같은 401 본문의 POST fixture를 쓴다(manifest 상태 401).
        fx(aiPost('401-unauthorized')),
      ]);
      r.show(async, wait: Duration.zero);
      r.pass(async, _sec(60));
      expect(r.toast.messages, [Copy.aiErrorLogin]);
      expect(r.api.getCalls(), 2);
    });
  });

  group('화면 이탈', () {
    fakeTest('TC-AIR-042 폴링 중 화면을 벗어나면 폴링을 멈춘다', (async) {
      final r = _processingRig();
      r.show(async, wait: Duration.zero);
      r.pass(async, _sec(4));
      r.session.onHidden();
      final before = r.api.getCalls();
      r.pass(async, _sec(60));
      expect(r.api.getCalls(), before);
    });

    fakeTest('TC-AIR-042 REQ-AIR-031 이탈 뒤 도착한 GET 응답은 상태를 바꾸지 않는다', (async) {
      final r = AiRig();
      r.api.get([
        fx(aiGet('processing')),
        fx(aiGet('completed'), delay: _sec(2)),
      ]);
      r.show(async, wait: Duration.zero);
      r.pass(async, _sec(4)); // 3초에 나간 폴링 GET이 5초에 답한다
      r.session.onHidden();
      r.pass(async, _sec(5));
      expect(r.state.pill, AiPill.processing);
      expect(r.state.review!.status.name, 'processing');
    });

    fakeTest('TC-AIR-042 REQ-AIR-023 이탈 뒤 도착한 POST 응답은 상태도 토스트도 만들지 않는다', (
      async,
    ) {
      final r = AiRig();
      r.api.post([fx(aiPost('400-limit-reached'), delay: _sec(3))]);
      r.show(async);
      r.request(async, wait: _sec(1));
      r.session.onHidden();
      r.pass(async, _sec(10));
      expect(r.toast.messages, isEmpty);
      expect(r.state.pill, isNot(AiPill.processing));
    });

    fakeTest(
      'TC-AIR-042 REQ-AIR-028 이탈 뒤 이탈 중에 흐른 시간과 상관없이 복귀하면 GET부터 새 창을 연다',
      (async) {
        final r = _processingRig();
        r.show(async, wait: Duration.zero);
        r.pass(async, _sec(100));
        r.session.onHidden();
        r.pass(async, _sec(100));
        r.session.onShown();
        r.pass(async, Duration.zero);
        expect(r.api.getOffsets().last, _sec(200));
        r.pass(async, _sec(299));
        expect(r.state.notice, isNull);
        r.pass(async, _sec(1));
        expect(r.state.notice, Copy.aiPollTimeout);
        expect(r.api.getOffsets().last, _sec(200 + 297));
      },
    );
  });

  group('늦은 응답', () {
    fakeTest('TC-AIR-043 새로 조회한 완료 결과를 이전 폴링의 늦은 응답이 덮지 않는다', (async) {
      final r = AiRig();
      r.api.get([
        fx(aiGet('processing')),
        fx(aiGet('processing'), delay: _sec(5)),
        fx(aiGet('completed')),
      ]);
      r.show(async, wait: Duration.zero);
      r.pass(async, _s3); // 폴링 GET(5초 지연)이 나간다
      r.pass(async, _sec(1));
      r.session.onShown(); // 수동 갱신: 즉시 COMPLETED
      r.pass(async, const Duration(milliseconds: 100));
      expect(r.state.pill, AiPill.view);
      r.pass(async, _sec(10)); // 늦은 PROCESSING이 도착한다
      expect(r.state.pill, AiPill.view);
      expect(r.state.review!.result, isNotNull);
    });

    fakeTest('TC-AIR-044 게시물 A에서 B로 옮긴 뒤 A의 늦은 GET 응답이 B를 덮지 않는다', (async) {
      final r = AiRig();
      r.api.get([fx(aiGet('completed'), delay: _sec(5))]);
      r.api.get([fx(aiGet('none'))], postId: aiPostB);
      r.show(async, wait: _sec(1));
      r.session.setTarget(r.targetB);
      r.pass(async, _sec(1));
      expect(r.state.pill, AiPill.request);
      r.pass(async, _sec(10));
      expect(r.state.pill, AiPill.request);
      expect(r.state.review!.status.name, 'none');
      expect(r.api.getCalls(aiPostB), 1);
    });

    fakeTest('TC-AIR-044 계정이 바뀌면(clearAll) 이전 계정의 늦은 응답을 버린다', (async) {
      final r = AiRig();
      r.api.get([fx(aiGet('completed'), delay: _sec(5))]);
      r.show(async, wait: _sec(1));
      r.session.clearAll();
      r.pass(async, _sec(10));
      expect(r.state.pill, AiPill.hidden);
      expect(r.state.review, isNull);
      expect(r.session.target, isNull);
      expect(r.api.getCalls(), 1);
    });

    fakeTest('TC-AIR-044 dispose 뒤에 도착한 응답은 아무 것도 바꾸지 않는다', (async) {
      final r = AiRig();
      r.api.get([fx(aiGet('completed'), delay: _sec(5))]);
      r.show(async, wait: _sec(1));
      final states = r.states.length;
      r.session.dispose();
      r.pass(async, _sec(10));
      expect(r.states.length, states);
      expect(r.toast.messages, isEmpty);
    });
  });
}
