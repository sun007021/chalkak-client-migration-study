import 'package:chalkak/core/network/api_error.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_async_helpers.dart';
import '../../../support/feedback_fakes.dart';
import '../../../support/net_harness.dart';

const _created = 'feedback/feedbacks__created.json';
const _blank = 'feedback/feedbacks__bad-request-blank.json';
const _tooLong = 'feedback/feedbacks__bad-request-too-long.json';
const _internal = 'feedback/feedbacks__internal-error.json';

void main() {
  fakeTest(
    'TC-FDBK-015 POST /feedbacks JSON 바디 {content}, Bearer 헤더, application/json이다',
    (async) {
      final r = FeedbackRig();
      r.onPost([fx(_created)]);
      resolve(async, r.api.send('좋아요'));
      final request = r.http.adapter.where('POST', feedbacksPath).single;
      expect(request.method, 'POST');
      expect(request.path, '/api/v1/feedbacks');
      expect(request.jsonBody, {'content': '좋아요'});
      expect(request.header('authorization'), 'Bearer at1');
      expect(request.header('content-type'), contains('application/json'));
    },
  );

  fakeTest('REQ-FDBK-007 content 외의 필드(앱 버전·기기 정보)를 보내지 않는다', (async) {
    final r = FeedbackRig();
    r.onPost([fx(_created)]);
    resolve(async, r.api.send('내용'));
    expect(r.http.adapter.where('POST', feedbacksPath).single.jsonBody!.keys, [
      'content',
    ]);
  });

  fakeTest('TC-FDBK-008 TC-FDBK-012 받은 내용을 바꾸지 않고 그대로 보낸다(개행·연속 공백 보존)', (
    async,
  ) {
    final r = FeedbackRig();
    r.onPost([fx(_created)]);
    const content = '첫 줄  \n\n   둘째\t\t줄';
    resolve(async, r.api.send(content));
    expect(r.http.adapter.where('POST', feedbacksPath).single.jsonBody, {
      'content': content,
    });
  });

  fakeTest('TC-FDBK-016 201 응답에서 feedbackId와 createdAt(UTC)을 읽는다', (async) {
    final r = FeedbackRig();
    r.onPost([fx(_created)]);
    final receipt = resolve(async, r.api.send('좋아요'));
    expect(receipt.feedbackId, '12121212-1212-4121-8121-121212121201');
    expect(receipt.createdAt, DateTime.utc(2026, 10, 27, 3));
    expect(receipt.createdAt.isUtc, isTrue);
  });

  for (final (name, fixture) in [('빈 내용', _blank), ('1000자 초과', _tooLong)]) {
    fakeTest(
      'TC-FDBK-021 400 BUSINESS_ERROR($name)는 서버 message를 담은 ApiError다',
      (async) {
        final r = FeedbackRig();
        r.onPost([fx(fixture)]);
        final p = start(async, r.api.send('x'));
        final error = p.error! as ApiError;
        expect(error.status, 400);
        expect(error.errorCode, ApiErrorCode.businessError);
        expect(error.message, isNotEmpty);
        expect(r.posts, 1);
      },
    );
  }

  fakeTest('TC-FDBK-024 500은 자동 재시도 없이 요청 1회로 끝난다', (async) {
    final r = FeedbackRig();
    r.onPost([fx(_internal)]);
    final p = start(async, r.api.send('x'));
    advance(async, const Duration(seconds: 10));
    expect((p.error! as ApiError).status, 500);
    expect(r.posts, 1);
  });
}
