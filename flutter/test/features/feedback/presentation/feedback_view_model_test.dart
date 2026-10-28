import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/feedback/presentation/feedback_view_model.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/auth_fakes.dart' show AuthHttpHarness;
import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/feedback_fakes.dart';
import '../../../support/fixtures.dart';
import '../../../support/net_harness.dart' show advance, sessionAt, settle;

const _created = 'feedback/feedbacks__created.json';
const _blank = 'feedback/feedbacks__bad-request-blank.json';
const _tooLong = 'feedback/feedbacks__bad-request-too-long.json';
const _unauthorized = 'feedback/feedbacks__unauthorized.json';
const _internal = 'feedback/feedbacks__internal-error.json';
const _unavailable = 'common/error__service-unavailable-503.json';
const _refreshOk = 'auth/refresh__success.json';
const _refreshReauth = 'auth/refresh__reauthentication-required.json';

String _message(String fixture) =>
    (Fixture.load(fixture) as Map)['message']! as String;

void main() {
  group('입력과 검증', () {
    fakeTest('TC-FDBK-003 초기 상태에서는 보내기가 비활성이고 카운터는 0이다', (async) {
      final r = FeedbackRig();
      expect(r.state.canSend, isFalse);
      expect(r.state.count, 0);
      expect(r.state.text, isEmpty);
      expect(r.state.sending, isFalse);
      expect(r.state.validationMessage, isNull);
      expect(r.state.errorMessage, isNull);
    });

    fakeTest('TC-FDBK-004 공백만 입력하면 전송 불가이고 서버 호출이 0건이다', (async) {
      final r = FeedbackRig();
      r.onPost([fx(_created)]);
      for (final raw in [' ', '\t\t', '\n\n', '　　', ' \t\n　 ']) {
        r.vm.onTextChanged(raw);
        expect(r.state.canSend, isFalse, reason: raw.codeUnits.toString());
        expect(r.state.count, 0);
        r.vm.send();
      }
      advance(async, const Duration(seconds: 1));
      expect(r.posts, 0);
      expect(r.state.validationMessage, isNull);
      expect(r.state.errorMessage, isNull);
    });

    fakeTest('TC-FDBK-005 trim 후 1 code point면 전송 가능하다', (async) {
      final r = FeedbackRig();
      r.vm.onTextChanged('  a  ');
      expect(r.state.canSend, isTrue);
      expect(r.state.count, 1);
    });

    fakeTest('TC-FDBK-006 trim 후 정확히 1000자는 허용되고 요청이 나간다', (async) {
      final r = FeedbackRig();
      r.onPost([fx(_created)]);
      r.sendText(async, repeat('a', 1000));
      expect(r.posts, 1);
      expect(r.state.validationMessage, isNull);
    });

    fakeTest('TC-FDBK-007 trim 후 1001자는 요청 0건이고 안내 문구를 보인다', (async) {
      final r = FeedbackRig();
      r.onPost([fx(_created)]);
      final text = repeat('a', 1001);
      r.sendText(async, text);
      expect(r.posts, 0);
      expect(r.state.validationMessage, Copy.fdbkErrorInvalid);
      expect(r.state.text, text);
      expect(r.state.sending, isFalse);
    });

    fakeTest('TC-FDBK-007 입력을 고치면 검증 문구가 사라진다', (async) {
      final r = FeedbackRig();
      r.sendText(async, repeat('a', 1001));
      r.vm.onTextChanged(repeat('a', 1000));
      expect(r.state.validationMessage, isNull);
    });

    fakeTest(
      'TC-FDBK-008 앞뒤 공백 포함 1002자, trim 후 1000자는 허용되고 서버로 가는 content는 trim 값이다',
      (async) {
        final r = FeedbackRig();
        r.onPost([fx(_created)]);
        r.sendText(async, ' ${repeat('a', 1000)} ');
        expect(r.http.adapter.where('POST', feedbacksPath).single.jsonBody, {
          'content': repeat('a', 1000),
        });
      },
    );

    fakeTest('TC-FDBK-009 이모지 1000개는 허용하고 1001개는 거부한다', (async) {
      final r = FeedbackRig();
      r.onPost([fx(_created)]);
      r.sendText(async, repeat('\u{1F600}', 1001));
      expect(r.posts, 0);
      expect(r.state.validationMessage, Copy.fdbkErrorInvalid);
      r.sendText(async, repeat('\u{1F600}', 1000));
      expect(r.posts, 1);
    });

    fakeTest('TC-FDBK-010 결합 이모지 200개는 허용하고 201개는 거부한다', (async) {
      final r = FeedbackRig();
      r.onPost([fx(_created)]);
      r.sendText(async, repeat(familyEmoji, 201));
      expect(r.posts, 0);
      expect(r.state.count, 1005);
      r.sendText(async, repeat(familyEmoji, 200));
      expect(r.posts, 1);
    });

    fakeTest('TC-FDBK-012 중간의 개행·연속 공백은 보존하고 앞뒤만 제거해 보낸다', (async) {
      final r = FeedbackRig();
      r.onPost([fx(_created)]);
      r.sendText(async, '  \n첫 줄  \n\n   둘째\t\t줄 　');
      expect(r.http.adapter.where('POST', feedbacksPath).single.jsonBody, {
        'content': '첫 줄  \n\n   둘째\t\t줄',
      });
    });

    fakeTest('TC-FDBK-013 카운터는 trim 후 code point 수와 항상 같다', (async) {
      final r = FeedbackRig();
      final cases = {
        '': 0,
        'ab': 2,
        '  ab  ': 2,
        '\u{1F600}': 1,
        familyEmoji: 5,
        '  ${repeat('a', 1001)}  ': 1001,
      };
      for (final e in cases.entries) {
        r.vm.onTextChanged(e.key);
        expect(r.state.count, e.value, reason: e.key);
      }
    });

    fakeTest('TC-FDBK-014 10만 자를 붙여넣어도 카운터가 정확하고 전송은 거부된다', (async) {
      final r = FeedbackRig();
      r.onPost([fx(_created)]);
      r.vm.onTextChanged(repeat('a', 100000));
      expect(r.state.count, 100000);
      expect(r.state.canSend, isTrue);
      r.vm.send();
      advance(async, const Duration(seconds: 1));
      expect(r.posts, 0);
      expect(r.state.validationMessage, Copy.fdbkErrorInvalid);
    });
  });

  group('전송', () {
    fakeTest('TC-FDBK-017 TC-FDBK-020 전송 성공이면 토스트가 뜨고 화면을 닫으며 입력이 비워진다', (
      async,
    ) {
      final r = FeedbackRig();
      r.onPost([fx(_created)]);
      r.sendText(async, '좋은 앱이에요');
      expect(r.toast.messages, [Copy.fdbkSuccess]);
      expect(r.events.single, isA<CloseFeedback>());
      expect(r.state.text, isEmpty);
      expect(r.state.count, 0);
      expect(r.state.canSend, isFalse);
      expect(r.state.sending, isFalse);
      expect(r.state.validationMessage, isNull);
      expect(r.state.errorMessage, isNull);
    });

    fakeTest('REQ-FDBK-006 전송 중에는 sending이고 보내기가 비활성이다', (async) {
      final r = FeedbackRig();
      r.onPost([fx(_created, delay: const Duration(seconds: 2))]);
      r.sendText(async, '내용', const Duration(seconds: 1));
      expect(r.state.sending, isTrue);
      expect(r.state.canSend, isFalse);
      advance(async, const Duration(seconds: 2));
      expect(r.state.sending, isFalse);
    });

    fakeTest('TC-FDBK-019 보내기를 3회 연타해도 POST는 1회뿐이다', (async) {
      final r = FeedbackRig();
      r.onPost([fx(_created, delay: const Duration(seconds: 1))]);
      r.vm.onTextChanged('내용');
      r.vm.send();
      r.vm.send();
      r.vm.send();
      advance(async, const Duration(seconds: 3));
      expect(r.posts, 1);
      expect(r.toast.messages, [Copy.fdbkSuccess]);
    });

    fakeTest('TC-FDBK-021 400 BUSINESS_ERROR(빈 내용)는 서버 message를 보이고 입력은 유지된다', (
      async,
    ) {
      final r = FeedbackRig();
      r.onPost([fx(_blank)]);
      r.sendText(async, '내용');
      expect(r.state.errorMessage, _message(_blank));
      expect(r.state.text, '내용');
      expect(r.state.sending, isFalse);
      expect(r.events, isEmpty);
      expect(r.toast.messages, isEmpty);
    });

    fakeTest('TC-FDBK-021 400 BUSINESS_ERROR(1000자 초과)도 서버 message를 그대로 보인다', (
      async,
    ) {
      final r = FeedbackRig();
      r.onPost([fx(_tooLong)]);
      r.sendText(async, '내용');
      expect(r.state.errorMessage, _message(_tooLong));
      expect(r.state.text, '내용');
    });

    fakeTest('TC-FDBK-022 401은 갱신 뒤 원 요청을 1회 재전송해 성공하면 정상 완료한다', (async) {
      final r = FeedbackRig();
      r.onPost([fx(_unauthorized), fx(_created)]);
      r.http.adapter.on('POST', AuthHttpHarness.refreshPath, [fx(_refreshOk)]);
      r.sendText(async, '내용');
      expect(r.posts, 2);
      expect(r.http.adapter.count('POST', AuthHttpHarness.refreshPath), 1);
      expect(r.toast.messages, [Copy.fdbkSuccess]);
      expect(r.events.single, isA<CloseFeedback>());
    });

    fakeTest('TC-FDBK-023 REAUTHENTICATION_REQUIRED면 세션이 지워지고 문구·닫기 없이 끝난다', (
      async,
    ) {
      final r = FeedbackRig();
      r.onPost([fx(_unauthorized)]);
      r.http.adapter.on('POST', AuthHttpHarness.refreshPath, [
        fx(_refreshReauth),
      ]);
      r.sendText(async, '내용');
      expect(r.http.clearedReasons, [
        SessionClearReason.reauthenticationRequired,
      ]);
      expect(r.toast.messages, isEmpty);
      expect(r.state.errorMessage, isNull);
      expect(r.events, isEmpty);
      expect(r.state.sending, isFalse);
    });

    fakeTest('TC-FDBK-024 500은 일반 오류 문구를 보이고 입력을 유지하며 요청은 1회뿐이다', (async) {
      final r = FeedbackRig();
      r.onPost([fx(_internal)]);
      r.sendText(async, '내용', const Duration(seconds: 10));
      expect(r.posts, 1);
      expect(r.state.errorMessage, Copy.fdbkErrorGeneric);
      expect(r.state.text, '내용');
      expect(r.state.canSend, isTrue);
    });

    fakeTest('TC-FDBK-025 연결 실패는 네트워크 문구를 보이고 입력 유지, 재시도 없이 다시 보낼 수 있다', (
      async,
    ) {
      final r = FeedbackRig();
      r.onPost([const FakeResponse.fault(FakeFault.disconnect), fx(_created)]);
      r.sendText(async, '내용', const Duration(seconds: 5));
      expect(r.posts, 1);
      expect(r.state.errorMessage, Copy.commonErrorNetwork);
      expect(r.state.text, '내용');
      expect(r.state.canSend, isTrue);
      r.vm.send();
      advance(async, const Duration(seconds: 1));
      expect(r.posts, 2);
      expect(r.toast.messages, [Copy.fdbkSuccess]);
    });

    fakeTest('TC-FDBK-025 타임아웃도 네트워크 문구이고 자동 재시도가 없다', (async) {
      final r = FeedbackRig();
      r.onPost([const FakeResponse.fault(FakeFault.timeout)]);
      r.sendText(async, '내용', const Duration(seconds: 40));
      expect(r.posts, 1);
      expect(r.state.errorMessage, Copy.commonErrorNetwork);
      expect(r.state.text, '내용');
    });

    fakeTest('TC-FDBK-026 타임아웃 뒤 수동 재전송은 중복 제거 없이 한 번 더 보낸다', (async) {
      final r = FeedbackRig();
      r.onPost([const FakeResponse.fault(FakeFault.timeout), fx(_created)]);
      r.sendText(async, '같은 내용', const Duration(seconds: 40));
      r.vm.send();
      advance(async, const Duration(seconds: 1));
      final bodies = [
        for (final q in r.http.adapter.where('POST', feedbacksPath)) q.jsonBody,
      ];
      expect(bodies, [
        {'content': '같은 내용'},
        {'content': '같은 내용'},
      ]);
      expect(r.toast.messages, [Copy.fdbkSuccess]);
    });

    fakeTest('TC-FDBK-026 성공 뒤에도 제출 횟수 제한 없이 다시 보낼 수 있다', (async) {
      final r = FeedbackRig();
      r.onPost([fx(_created)]);
      r.sendText(async, '하나');
      r.sendText(async, '둘');
      r.sendText(async, '셋');
      expect(r.posts, 3);
    });

    fakeTest('TC-FDBK-027 503과 Retry-After여도 재시도 없이 일반 오류 문구를 보인다', (async) {
      final r = FeedbackRig();
      r.onPost([fx(_unavailable)]);
      r.sendText(async, '내용', const Duration(seconds: 40));
      expect(r.posts, 1);
      expect(r.state.errorMessage, Copy.fdbkErrorGeneric);
      expect(r.state.text, '내용');
    });

    fakeTest('TC-FDBK-028 정지 회원도 201이면 성공으로 처리하고 정지 안내가 없다', (async) {
      final r = FeedbackRig();
      r.onPost([fx(_created)]);
      r.sendText(async, '내용');
      expect(r.toast.messages, [Copy.fdbkSuccess]);
      expect(r.state.errorMessage, isNull);
      expect(r.events.single, isA<CloseFeedback>());
    });

    fakeTest('REQ-FDBK-009 실패 뒤 입력을 고치면 오류 문구가 사라지고 다시 보낼 수 있다', (async) {
      final r = FeedbackRig();
      r.onPost([fx(_internal), fx(_internal), fx(_internal), fx(_created)]);
      r.sendText(async, '내용', const Duration(seconds: 10));
      expect(r.state.errorMessage, isNotNull);
      r.vm.onTextChanged('내용 수정');
      expect(r.state.errorMessage, isNull);
    });

    fakeTest('TC-FDBK-029 전송 중 화면을 떠나도 취소 오류가 보이지 않는다', (async) {
      final r = FeedbackRig();
      r.onPost([fx(_created, delay: const Duration(seconds: 2))]);
      r.sendText(async, '내용', const Duration(seconds: 1));
      r.vm.dispose();
      advance(async, const Duration(seconds: 5));
      expect(r.toast.messages, isEmpty);
      expect(r.events, isEmpty);
    });

    fakeTest('TC-FDBK-030 전송 중 로그아웃하면 응답이 와도 토스트도 화면 전환도 없다', (async) {
      final r = FeedbackRig();
      r.onPost([fx(_created, delay: const Duration(seconds: 2))]);
      r.sendText(async, '내용', const Duration(seconds: 1));
      r.http.sessions.clear(SessionClearReason.userLogout);
      advance(async, const Duration(seconds: 5));
      expect(r.toast.messages, isEmpty);
      expect(r.events, isEmpty);
    });

    fakeTest('TC-FDBK-030 전송 중 다른 계정으로 바뀌면 응답을 버린다', (async) {
      final r = FeedbackRig();
      r.onPost([fx(_created, delay: const Duration(seconds: 2))]);
      r.sendText(async, '내용', const Duration(seconds: 1));
      r.http.sessions.save(sessionAt(userId: 'user-2'));
      advance(async, const Duration(seconds: 5));
      expect(r.toast.messages, isEmpty);
      expect(r.events, isEmpty);
    });
  });

  group('분석과 푸시 보류 훅', () {
    fakeTest('REQ-FDBK-014 화면이 보이면 screen_view(feedback)를 한 번 보낸다', (async) {
      final r = FeedbackRig();
      r.vm.onShown();
      r.vm.onShown();
      settle(async);
      expect(r.analytics.screenNames, ['feedback']);
    });

    fakeTest('REQ-FDBK-014 작성 중에는 true, 닫히면 false로 푸시 이동 보류 훅을 부른다', (async) {
      final r = FeedbackRig();
      r.vm.onShown();
      expect(r.composing, [true]);
      r.vm.dispose();
      expect(r.composing, [true, false]);
    });

    fakeTest('TC-FDBK-034 피드백 내용이 로그·분석 파라미터에 남지 않는다', (async) {
      final r = FeedbackRig();
      r.onPost([fx(_created)]);
      const secret = '비밀스러운피드백내용-7f3a';
      r.vm.onShown();
      r.sendText(async, secret);
      expect(r.analytics.events.map((e) => e.name), ['screen_view']);
      for (final e in r.analytics.events) {
        expect(e.parameters.values.join(), isNot(contains(secret)));
      }
      expect(r.http.logs.all, isNot(contains(secret)));
    });
  });
}
