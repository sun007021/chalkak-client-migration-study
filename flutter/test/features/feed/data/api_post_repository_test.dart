import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/features/feed/data/api_post_repository.dart';
import 'package:chalkak/features/feed/domain/post_detail.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/display_fakes.dart';
import '../../../support/fake_adapter.dart';
import '../../../support/fixtures.dart';
import '../../../support/net_harness.dart';

const _detailPath = '$v1/posts/$myPostId';

ApiPostRepository _repo(NetHarness h) => ApiPostRepository(client: h.client);

ApiError _err(Probe<Object?> p) => p.error! as ApiError;

Probe<PostDetail> _detail(NetHarness h, [String id = myPostId]) =>
    Probe(_repo(h).fetchDetail(id));

Probe<PostTitleResult> _title(NetHarness h, String? title) =>
    Probe(_repo(h).updateTitle(myPostId, title));

Probe<void> _delete(NetHarness h) => Probe(_repo(h).deletePost(myPostId));

void main() {
  group('GET /posts/{postId}', () {
    netTest('TC-FEED-002 GET, Authorization 필수, 응답 필드를 모두 매핑한다', (h, a) {
      h.adapter.on('GET', _detailPath, [
        FakeResponse.fixture(detailMineTodayFx),
      ]);
      final r = _detail(h);
      settle(a);
      final req = h.adapter.requests.single;
      expect(req.method, 'GET');
      expect(
        req.path,
        _detailPath,
        reason: 'trailing slash 없는 base URL에서도 경로 유지',
      );
      expect(req.hasAuthorization, isTrue);
      final d = r.value!;
      expect(d.id, myPostId);
      expect(d.authorId, myUserId);
      expect(d.topicId, '11111111-1111-4111-8111-111111111127');
      expect(d.topicTitle, '가을 하늘');
      expect(d.topicDate, today);
      expect(d.originalImageUrl, endsWith('/$myPostId/original.webp'));
      expect(d.thumbnailImageUrl, endsWith('/$myPostId/thumbnail.webp'));
      expect(d.signatureOriginalImageUrl, endsWith('original.png'));
      expect(d.title, '비 오는 날');
      expect(d.likeCount, 10);
      expect(d.isLiked, isFalse);
    }, session: sessionAt());

    netTest('TC-FEED-003 thumbnailImageUrl이 null이면 원본으로 대체하고 오류가 아니다', (h, a) {
      final id = postIdOf(5);
      h.adapter.on('GET', '$v1/posts/$id', [
        FakeResponse.fixture('feed/posts-detail__null-thumbnail.json'),
      ]);
      final r = _detail(h, id);
      settle(a);
      expect(r.succeeded, isTrue);
      expect(r.value!.thumbnailImageUrl, r.value!.originalImageUrl);
    }, session: sessionAt());

    netTest('TC-FEED-013 제목이 null이면 title은 null로 읽는다', (h, a) {
      final id = postIdOf(4);
      h.adapter.on('GET', '$v1/posts/$id', [
        FakeResponse.fixture(detailNoTitleFx),
      ]);
      final r = _detail(h, id);
      settle(a);
      expect(r.value!.title, isNull);
    }, session: sessionAt());

    netTest('TC-FEED-009 필수 필드 누락·likeCount 문자열·음수는 계약 위반이다', (h, a) {
      final good = (Fixture.load(detailMineTodayFx) as Map)
          .cast<String, Object?>();
      final bad = <Map<String, Object?>>[
        {...good}..remove('topic'),
        {...good, 'likeCount': '많음'},
        {...good, 'likeCount': -1},
        {...good}..remove('authorId'),
        {...good, 'isLiked': 'yes'},
      ];
      for (final body in bad) {
        final h2 = NetHarness(session: sessionAt());
        h2.adapter.on('GET', _detailPath, [FakeResponse.json(200, body)]);
        final r = _detail(h2);
        settle(a);
        expect(_err(r).isInvalidResponse, isTrue, reason: '$body');
      }
    }, session: sessionAt());

    netTest('TC-FEED-009 fixture invalid-schema도 계약 위반이다', (h, a) {
      h.adapter.on('GET', _detailPath, [FakeResponse.fixture(detailInvalidFx)]);
      final r = _detail(h);
      settle(a);
      expect(_err(r).isInvalidResponse, isTrue);
    }, session: sessionAt());

    netTest('TC-FEED-007 404는 status 404로, 400·500은 각각 그 status로 전달된다', (h, a) {
      for (final (fx, status) in [
        (detail404Fx, 404),
        (detail400Fx, 400),
        (detail500Fx, 500),
      ]) {
        final h2 = NetHarness(session: sessionAt());
        h2.adapter.on('GET', _detailPath, [FakeResponse.fixture(fx)]);
        final r = _detail(h2);
        advance(a, const Duration(seconds: 5));
        expect(_err(r).status, status, reason: fx);
      }
    }, session: sessionAt());

    netTest('TC-FEED-008 500은 0.5초·1초 뒤 재시도해 총 3번 보낸다', (h, a) {
      h.adapter.on('GET', _detailPath, [FakeResponse.fixture(detail500Fx)]);
      _detail(h);
      advance(a, const Duration(seconds: 5));
      expect(h.adapter.requests, hasLength(3));
    }, session: sessionAt());

    netTest('TC-FEED-006 401 UNAUTHORIZED는 refresh 한 번 뒤 재전송한다', (h, a) {
      h.adapter.on('GET', _detailPath, [
        FakeResponse.fixture('feed/posts-detail__401-unauthorized.json'),
        FakeResponse.fixture(detailMineTodayFx),
      ]);
      h.adapter.on('POST', '$v1/auth/refresh', [
        FakeResponse.fixture('auth/refresh__success.json'),
      ]);
      final r = _detail(h);
      advance(a, const Duration(seconds: 1));
      expect(r.succeeded, isTrue);
      expect(h.refreshCalls, 1);
      expect(h.adapter.where('GET', _detailPath), hasLength(2));
    }, session: sessionAt());

    netTest('TC-FEED-006 REAUTHENTICATION_REQUIRED이면 세션을 정리하고 오류로 끝난다', (h, a) {
      h.adapter.on('GET', _detailPath, [
        FakeResponse.fixture('auth/refresh__reauthentication-required.json'),
      ]);
      final r = _detail(h);
      advance(a, const Duration(seconds: 1));
      expect(_err(r).isReauthenticationRequired, isTrue);
      expect(h.clearedEvents, [SessionClearReason.reauthenticationRequired]);
    }, session: sessionAt());
  });

  group('PUT /posts/{postId}', () {
    netTest(
      'TC-FEED-023 PUT, Authorization, JSON 본문 {title}이고 응답 {postId, title}을 읽는다',
      (h, a) {
        h.adapter.on('PUT', _detailPath, [FakeResponse.fixture(titleOkFx)]);
        final r = _title(h, '가나다라마바사아자차');
        settle(a);
        final req = h.adapter.requests.single;
        expect(req.method, 'PUT');
        expect(req.path, _detailPath);
        expect(req.hasAuthorization, isTrue);
        expect(req.jsonBody, {'title': '가나다라마바사아자차'});
        expect(r.value!.postId, myPostId);
        expect(r.value!.title, '가나다라마바사아자차');
      },
      session: sessionAt(),
    );

    netTest('TC-FEED-022 title이 null이면 키를 빼지 않고 null을 보낸다', (h, a) {
      h.adapter.on('PUT', _detailPath, [FakeResponse.fixture(titleNullFx)]);
      final r = _title(h, null);
      settle(a);
      final req = h.adapter.requests.single;
      expect(req.jsonBody, contains('title'));
      expect(req.jsonBody!['title'], isNull);
      expect(req.body, contains('"title":null'));
      expect(r.value!.title, isNull);
    }, session: sessionAt());

    netTest('TC-FEED-027 400은 재시도 없이 status 400 오류다(message로 분기하지 않는다)', (
      h,
      a,
    ) {
      for (final fx in [title400StateFx, title400LongFx]) {
        final h2 = NetHarness(session: sessionAt());
        h2.adapter.on('PUT', _detailPath, [FakeResponse.fixture(fx)]);
        final r = _title(h2, '가나다');
        advance(a, const Duration(seconds: 5));
        expect(_err(r).status, 400, reason: fx);
        expect(h2.adapter.requests, hasLength(1), reason: fx);
      }
    }, session: sessionAt());

    netTest('TC-FEED-029 403 FORBIDDEN은 forbidden 오류이고 같은 요청을 다시 보내지 않는다', (
      h,
      a,
    ) {
      h.adapter.on('PUT', _detailPath, [FakeResponse.fixture(title403Fx)]);
      final r = _title(h, '가나다');
      advance(a, const Duration(seconds: 5));
      expect(_err(r).errorCode, ApiErrorCode.forbidden);
      expect(h.adapter.requests, hasLength(1));
    }, session: sessionAt());

    netTest('TC-FEED-030 404는 status 404 오류다', (h, a) {
      h.adapter.on('PUT', _detailPath, [FakeResponse.fixture(title404Fx)]);
      final r = _title(h, '가나다');
      advance(a, const Duration(seconds: 5));
      expect(_err(r).status, 404);
    }, session: sessionAt());

    netTest('TC-FEED-031 401은 refresh 한 번 뒤 같은 본문으로 재전송한다', (h, a) {
      h.adapter.on('PUT', _detailPath, [
        FakeResponse.fixture(title401Fx),
        FakeResponse.fixture(titleOkFx),
      ]);
      h.adapter.on('POST', '$v1/auth/refresh', [
        FakeResponse.fixture('auth/refresh__success.json'),
      ]);
      final r = _title(h, '가나다라마바사아자차');
      advance(a, const Duration(seconds: 1));
      expect(r.succeeded, isTrue);
      final puts = h.adapter.where('PUT', _detailPath).toList();
      expect(puts, hasLength(2));
      expect(puts[1].jsonBody, {'title': '가나다라마바사아자차'});
    }, session: sessionAt());

    netTest('TC-FEED-032 500·연결 실패는 멱등이라 0.5초·1초 백오프로 총 3번 시도한다', (h, a) {
      h.adapter.on('PUT', _detailPath, [FakeResponse.fixture(title500Fx)]);
      final r = _title(h, '가나다');
      advance(a, const Duration(seconds: 5));
      expect(_err(r).status, 500);
      expect(h.adapter.requests.map((q) => q.at.difference(t0)).toList(), [
        Duration.zero,
        const Duration(milliseconds: 500),
        const Duration(milliseconds: 1500),
      ]);
      final h2 = NetHarness(session: sessionAt());
      h2.adapter.on('PUT', _detailPath, [
        const FakeResponse.fault(FakeFault.disconnect),
      ]);
      final r2 = _title(h2, '가나다');
      advance(a, const Duration(seconds: 5));
      expect(_err(r2).isNetwork, isTrue);
      expect(h2.adapter.requests, hasLength(3));
    }, session: sessionAt());

    netTest('TC-FEED-033 같은 제목을 다시 저장해도 200 멱등 응답을 성공으로 읽는다', (h, a) {
      h.adapter.on('PUT', _detailPath, [FakeResponse.fixture(titleOkFx)]);
      final first = _title(h, '가나다라마바사아자차');
      settle(a);
      final second = _title(h, '가나다라마바사아자차');
      settle(a);
      expect(first.succeeded && second.succeeded, isTrue);
    }, session: sessionAt());

    netTest('TC-FEED-009 응답이 {postId, title} 계약을 어기면 invalidResponse다', (h, a) {
      h.adapter.on('PUT', _detailPath, [
        FakeResponse.json(200, {'title': '가나다'}),
      ]);
      final r = _title(h, '가나다');
      settle(a);
      expect(_err(r).isInvalidResponse, isTrue);
    }, session: sessionAt());
  });

  group('DELETE /posts/{postId}', () {
    netTest('TC-FEED-036 DELETE, Authorization, 본문 없음이고 204면 성공이다', (h, a) {
      h.adapter.on('DELETE', _detailPath, [FakeResponse.fixture(delete204Fx)]);
      final r = _delete(h);
      settle(a);
      expect(r.succeeded, isTrue);
      final req = h.adapter.requests.single;
      expect(req.method, 'DELETE');
      expect(req.path, _detailPath);
      expect(req.hasAuthorization, isTrue);
      expect(req.body ?? '', isEmpty);
    }, session: sessionAt());

    netTest('TC-FEED-037 이미 삭제된 게시물에 반복 DELETE해도 204는 성공이다', (h, a) {
      h.adapter.on('DELETE', _detailPath, [FakeResponse.fixture(delete204Fx)]);
      final first = _delete(h);
      settle(a);
      final second = _delete(h);
      settle(a);
      expect(first.succeeded && second.succeeded, isTrue);
    }, session: sessionAt());

    netTest('TC-FEED-039 400·403·404는 재시도 없이 그 status 오류다', (h, a) {
      for (final (fx, status) in [
        (delete400ValidatingFx, 400),
        (delete400RejectedFx, 400),
        (delete403Fx, 403),
        (delete404Fx, 404),
      ]) {
        final h2 = NetHarness(session: sessionAt());
        // 403 fixture는 다른 사람 게시물 경로를 가리키지만 어댑터는 경로로만 고른다.
        h2.adapter.on('DELETE', _detailPath, [FakeResponse.fixture(fx)]);
        final r = _delete(h2);
        advance(a, const Duration(seconds: 5));
        expect(_err(r).status, status, reason: fx);
        expect(h2.adapter.requests, hasLength(1), reason: fx);
      }
    }, session: sessionAt());

    netTest('TC-FEED-042 500은 총 3번 시도한 뒤 실패, 401은 refresh 후 재전송한다', (h, a) {
      h.adapter.on('DELETE', _detailPath, [FakeResponse.fixture(delete500Fx)]);
      final r = _delete(h);
      advance(a, const Duration(seconds: 5));
      expect(_err(r).status, 500);
      expect(h.adapter.requests, hasLength(3));
    }, session: sessionAt());

    netTest('TC-FEED-042 401이면 refresh 한 번 뒤 재전송해 성공한다', (h, a) {
      h.adapter.on('DELETE', _detailPath, [
        FakeResponse.fixture(delete401Fx),
        FakeResponse.fixture(delete204Fx),
      ]);
      h.adapter.on('POST', '$v1/auth/refresh', [
        FakeResponse.fixture('auth/refresh__success.json'),
      ]);
      final r = _delete(h);
      advance(a, const Duration(seconds: 1));
      expect(r.succeeded, isTrue);
      expect(h.refreshCalls, 1);
    }, session: sessionAt());
  });
}
