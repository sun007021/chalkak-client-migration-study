import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/features/ai_review/data/api_ai_review_repository.dart';
import 'package:chalkak/features/ai_review/domain/ai_review_models.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/ai_review_fakes.dart';
import '../../../support/fake_adapter.dart';
import '../../../support/fixtures.dart';
import '../../../support/net_harness.dart';

ApiAiReviewRepository _repo(NetHarness h) =>
    ApiAiReviewRepository(client: h.client);

Probe<AiReview> _get(NetHarness h) => Probe(_repo(h).get(aiPostA));
Probe<AiReview> _post(NetHarness h) => Probe(_repo(h).request(aiPostA));

ApiError _err(Probe<Object?> p) => p.error! as ApiError;

void _onGet(NetHarness h, List<FakeResponse> r) =>
    h.adapter.on('GET', aiPath(aiPostA), r);
void _onPost(NetHarness h, List<FakeResponse> r) =>
    h.adapter.on('POST', aiPath(aiPostA), r);

/// fixture를 읽어 일부 필드를 바꾼 200 응답(계약 위반 경계 값 확인용).
FakeResponse _modified(
  String name,
  void Function(Map<String, Object?> json) change,
) {
  final json = (Fixture.load(name) as Map).cast<String, Object?>();
  change(json);
  return FakeResponse.json(200, json);
}

Map<String, Object?> _result(Map<String, Object?> json) =>
    (json['result']! as Map).cast<String, Object?>();

void main() {
  group('요청 모양', () {
    netTest('TC-AIR-001 GET은 본문 없이 같은 경로와 Authorization을 쓴다', (h, a) {
      _onGet(h, [fx(aiGet('none'))]);
      final r = _get(h);
      settle(a);
      expect(r.succeeded, isTrue);
      final req = h.adapter.requests.single;
      expect(req.method, 'GET');
      expect(req.path, aiPath(aiPostA));
      expect(req.body ?? '', isEmpty);
      expect(req.hasAuthorization, isTrue);
    }, session: sessionAt());

    netTest('TC-AIR-001 POST도 같은 경로, 본문 없이 Authorization을 붙인다', (h, a) {
      _onPost(h, [fx(aiPost('202-processing'))]);
      final r = _post(h);
      settle(a);
      expect(r.succeeded, isTrue);
      final req = h.adapter.requests.single;
      expect(req.method, 'POST');
      expect(req.path, aiPath(aiPostA));
      expect(req.body ?? '', isEmpty);
      expect(req.hasAuthorization, isTrue);
    }, session: sessionAt());

    netTest('TC-AIR-001 TC-AIR-030 POST는 연결이 끊겨도 자동 재전송하지 않는다', (h, a) {
      _onPost(h, [fx(aiPost('timeout'))]);
      final r = _post(h);
      advance(a, const Duration(minutes: 1));
      expect(_err(r).kind, ApiErrorKind.network);
      expect(h.adapter.count('POST', aiPath(aiPostA)), 1);
    }, session: sessionAt());

    netTest('TC-AIR-031 POST 500은 재시도 없이 한 번만 나간다', (h, a) {
      _onPost(h, [fx(aiPost('500-server-error'))]);
      final r = _post(h);
      advance(a, const Duration(seconds: 30));
      expect(_err(r).status, 500);
      expect(h.adapter.count('POST', aiPath(aiPostA)), 1);
    }, session: sessionAt());
  });

  group('응답 해석', () {
    netTest('TC-AIR-002 NONE은 상태만 읽고 시각·result는 null, 재요청 불가다', (h, a) {
      _onGet(h, [fx(aiGet('none'))]);
      final r = _get(h);
      settle(a);
      final review = r.value!;
      expect(review.status, AiReviewStatus.none);
      expect(review.canRequestAgain, isFalse);
      expect(review.requestedAt, isNull);
      expect(review.completedAt, isNull);
      expect(review.result, isNull);
    }, session: sessionAt());

    netTest('TC-AIR-003 COMPLETED의 점수·기준·피드백·시각을 읽는다', (h, a) {
      _onGet(h, [fx(aiGet('completed'))]);
      final r = _get(h);
      settle(a);
      final review = r.value!;
      expect(review.status, AiReviewStatus.completed);
      expect(review.requestedAt, DateTime.utc(2026, 10, 27, 2, 58));
      expect(review.completedAt, DateTime.utc(2026, 10, 27, 2, 58, 21));
      final result = review.result!;
      expect(result.overallScore, 7.5);
      expect(result.distinctivePerspective, isTrue);
      expect(result.criteria, hasLength(1));
      expect(result.criteria.single.key, 'COMPOSITION');
      expect(result.criteria.single.label, '구도');
      expect(result.criteria.single.score, 7.5);
      expect(result.feedback.summary, '빛을 따라 시선이 흐르는 안정적인 구도');
      expect(result.feedback.strength, isNotEmpty);
      expect(result.feedback.weakness, isNotEmpty);
      expect(result.feedback.suggestion, isNotEmpty);
    }, session: sessionAt());

    netTest('TC-AIR-003 소수초가 있는 시각도 읽는다', (h, a) {
      _onGet(h, [fx(aiGet('completed-fractional-seconds'))]);
      final r = _get(h);
      settle(a);
      expect(r.value!.requestedAt, DateTime.utc(2026, 10, 27, 2, 58, 0, 123));
      expect(r.value!.completedAt, DateTime.utc(2026, 10, 27, 2, 58, 21, 123));
    }, session: sessionAt());

    netTest('TC-AIR-004 COMPLETED인데 result가 null이면 유효하지 않은 응답이다', (h, a) {
      _onGet(h, [fx(aiGet('completed-no-result'))]);
      final r = _get(h);
      settle(a);
      expect(_err(r).kind, ApiErrorKind.invalidResponse);
    }, session: sessionAt());

    netTest('REQ-AIR-045 feedback 항목이 비어 있으면 유효하지 않은 응답이다', (h, a) {
      _onGet(h, [
        _modified(aiGet('completed'), (json) {
          (_result(json)['feedback']! as Map)['strength'] = '';
        }),
      ]);
      final r = _get(h);
      settle(a);
      expect(_err(r).kind, ApiErrorKind.invalidResponse);
    }, session: sessionAt());

    netTest('TC-AIR-005 점수가 10.1이면 유효하지 않은 응답이다', (h, a) {
      _onGet(h, [fx(aiGet('score-out-of-range'))]);
      final r = _get(h);
      settle(a);
      expect(_err(r).kind, ApiErrorKind.invalidResponse);
    }, session: sessionAt());

    netTest('TC-AIR-005 점수가 -0.1이면 유효하지 않은 응답이다', (h, a) {
      _onGet(h, [
        _modified(aiGet('completed'), (json) {
          _result(json)['overallScore'] = -0.1;
        }),
      ]);
      final r = _get(h);
      settle(a);
      expect(_err(r).kind, ApiErrorKind.invalidResponse);
    }, session: sessionAt());

    netTest('TC-AIR-005 기준 점수가 범위 밖이어도 유효하지 않은 응답이다', (h, a) {
      _onGet(h, [
        _modified(aiGet('completed'), (json) {
          final criteria = (_result(json)['criteria']! as List)
              .cast<Map<String, Object?>>();
          criteria.first['score'] = 11;
        }),
      ]);
      final r = _get(h);
      settle(a);
      expect(_err(r).kind, ApiErrorKind.invalidResponse);
    }, session: sessionAt());

    netTest('TC-AIR-005 0.0과 10.0은 유효하다', (h, a) {
      _onGet(h, [
        fx(aiGet('completed-score-0')),
        fx(aiGet('completed-score-10')),
      ]);
      final zero = _get(h);
      settle(a);
      final ten = _get(h);
      settle(a);
      expect(zero.value!.result!.overallScore, 0.0);
      expect(ten.value!.result!.overallScore, 10.0);
    }, session: sessionAt());

    netTest('TC-AIR-006 FAILED는 result=null이고 canRequestAgain을 서버 값 그대로 읽는다', (
      h,
      a,
    ) {
      _onGet(h, [
        fx(aiGet('failed-can-retry')),
        fx(aiGet('failed-cannot-retry')),
      ]);
      final yes = _get(h);
      settle(a);
      final no = _get(h);
      settle(a);
      expect(yes.value!.status, AiReviewStatus.failed);
      expect(yes.value!.result, isNull);
      expect(yes.value!.canRequestAgain, isTrue);
      expect(no.value!.canRequestAgain, isFalse);
    }, session: sessionAt());

    netTest('TC-AIR-006 canRequestAgain 필드가 없으면 false다', (h, a) {
      _onGet(h, [fx(aiGet('missing-can-request-again'))]);
      final r = _get(h);
      settle(a);
      expect(r.value!.status, AiReviewStatus.failed);
      expect(r.value!.canRequestAgain, isFalse);
    }, session: sessionAt());

    netTest('TC-AIR-007 알 수 없는 status는 유효하지 않은 응답이다', (h, a) {
      _onGet(h, [fx(aiGet('unknown-status'))]);
      final r = _get(h);
      settle(a);
      expect(_err(r).kind, ApiErrorKind.invalidResponse);
    }, session: sessionAt());

    netTest('TC-AIR-007 PROCESSING인데 result가 있으면 유효하지 않은 응답이다', (h, a) {
      _onGet(h, [
        _modified(aiGet('processing'), (json) {
          json['result'] = _result(
            (Fixture.load(aiGet('completed')) as Map).cast<String, Object?>(),
          );
        }),
      ]);
      final r = _get(h);
      settle(a);
      expect(_err(r).kind, ApiErrorKind.invalidResponse);
    }, session: sessionAt());

    netTest(
      'TC-AIR-008 POST는 HTTP 코드가 아니라 status로 읽는다(202 PROCESSING, 200 COMPLETED)',
      (h, a) {
        _onPost(h, [fx(aiPost('202-processing')), fx(aiPost('200-completed'))]);
        final accepted = _post(h);
        settle(a);
        final done = _post(h);
        settle(a);
        expect(accepted.value!.status, AiReviewStatus.processing);
        expect(done.value!.status, AiReviewStatus.completed);
        expect(done.value!.result!.overallScore, 7.5);
      },
      session: sessionAt(),
    );
  });

  group('오류 보존', () {
    netTest('TC-AIR-009 400은 HTTP 상태와 서버 message를 그대로 보존한다', (h, a) {
      _onPost(h, [fx(aiPost('400-limit-reached'))]);
      final r = _post(h);
      settle(a);
      expect(_err(r).kind, ApiErrorKind.server);
      expect(_err(r).status, 400);
      expect(_err(r).message, '더 이상 AI 리뷰를 다시 요청할 수 없습니다.');
    }, session: sessionAt());

    netTest('TC-AIR-009 403도 상태와 message를 보존한다', (h, a) {
      _onPost(h, [fx(aiPost('403-banned'))]);
      final r = _post(h);
      settle(a);
      expect(_err(r).status, 403);
      expect(_err(r).errorCode, ApiErrorCode.forbidden);
      expect(_err(r).message, '차단된 회원입니다.');
    }, session: sessionAt());

    netTest('TC-AIR-009 요청 취소는 통신 오류가 아니라 취소로 남는다', (h, a) {
      _onGet(h, [
        FakeResponse.fixture(
          aiGet('processing'),
          delay: const Duration(seconds: 5),
        ),
      ]);
      final token = CancelToken();
      final r = Probe(_repo(h).get(aiPostA, cancelToken: token));
      advance(a, const Duration(seconds: 1));
      token.cancel();
      advance(a, const Duration(seconds: 10));
      expect(_err(r).kind, ApiErrorKind.cancelled);
    }, session: sessionAt());
  });

  group('재시도와 인증', () {
    netTest('TC-AIR-039 GET 5xx는 백오프로 재시도해 복구된 응답을 읽는다', (h, a) {
      _onGet(h, [fx(aiGet('500-server-error')), fx(aiGet('completed'))]);
      final r = _get(h);
      advance(a, const Duration(seconds: 3));
      expect(r.value!.status, AiReviewStatus.completed);
      expect(h.adapter.count('GET', aiPath(aiPostA)), 2);
    }, session: sessionAt());

    netTest('TC-AIR-047 503은 Retry-After 만큼 기다린 뒤 재시도한다', (h, a) {
      _onGet(h, [fx(aiGet('503-retry-after')), fx(aiGet('processing'))]);
      final r = _get(h);
      advance(a, const Duration(milliseconds: 900));
      expect(h.adapter.count('GET', aiPath(aiPostA)), 1);
      advance(a, const Duration(milliseconds: 200));
      expect(h.adapter.count('GET', aiPath(aiPostA)), 2);
      expect(r.value!.status, AiReviewStatus.processing);
    }, session: sessionAt());

    netTest('TC-AIR-029 POST 401은 토큰 갱신 뒤 원 요청을 한 번 다시 보낸다', (h, a) {
      _onPost(h, [
        fx(aiPost('401-unauthorized')),
        fx(aiPost('202-processing')),
      ]);
      h.adapter.on('POST', '$v1/auth/refresh', [
        FakeResponse.fixture('auth/refresh__success.json'),
      ]);
      final r = _post(h);
      advance(a, const Duration(seconds: 1));
      expect(r.value!.status, AiReviewStatus.processing);
      expect(h.refreshCalls, 1);
      expect(h.adapter.count('POST', aiPath(aiPostA)), 2);
    }, session: sessionAt());
  });
}
