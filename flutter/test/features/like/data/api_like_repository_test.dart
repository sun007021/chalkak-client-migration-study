import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/features/like/data/api_like_repository.dart';
import 'package:chalkak/features/like/domain/like_repository.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/display_fakes.dart';
import '../../../support/fake_adapter.dart';
import '../../../support/net_harness.dart';

const _likesPath = '$v1/posts/$myPostId/likes';

ApiLikeRepository _repo(NetHarness h) => ApiLikeRepository(client: h.client);

ApiError _err(Probe<Object?> p) => p.error! as ApiError;

Probe<LikeResult> _put(NetHarness h) => Probe(_repo(h).like(myPostId));
Probe<LikeResult> _delete(NetHarness h) => Probe(_repo(h).unlike(myPostId));

void main() {
  group('요청 모양', () {
    netTest('TC-LIKE-001 등록은 PUT, 본문 없이 Authorization을 붙인다', (h, a) {
      h.adapter.on('PUT', _likesPath, [
        FakeResponse.fixture('like/posts-likes-put__liked.json'),
      ]);
      final r = _put(h);
      settle(a);
      expect(r.succeeded, isTrue);
      final req = h.adapter.requests.single;
      expect(req.method, 'PUT');
      expect(req.path, _likesPath);
      expect(req.body ?? '', isEmpty);
      expect(req.hasAuthorization, isTrue);
    }, session: sessionAt());

    netTest('TC-LIKE-001 취소는 DELETE로 같은 경로를 쓴다', (h, a) {
      h.adapter.on('DELETE', _likesPath, [
        FakeResponse.fixture('like/posts-likes-delete__unliked.json'),
      ]);
      final r = _delete(h);
      settle(a);
      expect(r.succeeded, isTrue);
      final req = h.adapter.requests.single;
      expect(req.method, 'DELETE');
      expect(req.path, _likesPath);
      expect(req.body ?? '', isEmpty);
      expect(req.hasAuthorization, isTrue);
    }, session: sessionAt());
  });

  group('응답 해석', () {
    netTest('TC-LIKE-002 {postId, likeCount, isLiked}를 그대로 읽는다', (h, a) {
      h.adapter.on('PUT', _likesPath, [
        FakeResponse.fixture('like/posts-likes-put__liked.json'),
      ]);
      final r = _put(h);
      settle(a);
      expect(r.value!.postId, myPostId);
      expect(r.value!.likeCount, 11);
      expect(r.value!.isLiked, isTrue);
    }, session: sessionAt());

    netTest('TC-LIKE-002 응답 postId가 요청과 다르면 계약 위반(invalidResponse)이다', (h, a) {
      h.adapter.on('PUT', _likesPath, [
        FakeResponse.fixture('like/posts-likes-put__postid-mismatch.json'),
      ]);
      final r = _put(h);
      settle(a);
      expect(_err(r).isInvalidResponse, isTrue);
    }, session: sessionAt());

    netTest('TC-LIKE-002 PUT 응답이 isLiked=false이면 모순이라 invalidResponse', (h, a) {
      h.adapter.on('PUT', _likesPath, [
        FakeResponse.fixture('like/posts-likes-put__inconsistent-state.json'),
      ]);
      final r = _put(h);
      settle(a);
      expect(_err(r).isInvalidResponse, isTrue);
    }, session: sessionAt());

    netTest('TC-LIKE-002 DELETE 응답이 isLiked=true이면 invalidResponse', (h, a) {
      h.adapter.on('DELETE', _likesPath, [
        FakeResponse.json(200, {
          'postId': myPostId,
          'likeCount': 11,
          'isLiked': true,
        }),
      ]);
      final r = _delete(h);
      settle(a);
      expect(_err(r).isInvalidResponse, isTrue);
    }, session: sessionAt());

    netTest('TC-LIKE-002 필수 필드 누락·likeCount 음수·타입 오류는 invalidResponse', (h, a) {
      for (final body in <Map<String, Object?>>[
        {'postId': myPostId, 'isLiked': true},
        {'postId': myPostId, 'likeCount': -1, 'isLiked': true},
        {'postId': myPostId, 'likeCount': '11', 'isLiked': true},
      ]) {
        final h2 = NetHarness(session: sessionAt());
        h2.adapter.on('PUT', _likesPath, [FakeResponse.json(200, body)]);
        final r = _put(h2);
        settle(a);
        expect(_err(r).isInvalidResponse, isTrue, reason: '$body');
      }
    }, session: sessionAt());

    netTest('TC-LIKE-033 이미 좋아요한 글의 PUT은 likeCount 변화 없이 정상 응답이다', (h, a) {
      h.adapter.on('PUT', _likesPath, [
        FakeResponse.fixture('like/posts-likes-put__already-liked.json'),
      ]);
      final r = _put(h);
      settle(a);
      expect(r.succeeded, isTrue);
      expect(r.value!.isLiked, isTrue);
    }, session: sessionAt());

    netTest('TC-LIKE-033 좋아요 없는 글의 DELETE도 isLiked=false로 정상이다', (h, a) {
      h.adapter.on('DELETE', _likesPath, [
        FakeResponse.fixture('like/posts-likes-delete__not-liked.json'),
      ]);
      final r = _delete(h);
      settle(a);
      expect(r.succeeded, isTrue);
      expect(r.value!.isLiked, isFalse);
    }, session: sessionAt());
  });

  group('오류 전달', () {
    netTest('TC-LIKE-011 403 FORBIDDEN은 forbidden 오류로 전달되고 재전송하지 않는다', (h, a) {
      h.adapter.on('PUT', _likesPath, [
        FakeResponse.fixture('like/posts-likes-put__403-banned.json'),
      ]);
      final r = _put(h);
      advance(a, const Duration(seconds: 10));
      expect(_err(r).status, 403);
      expect(_err(r).errorCode, ApiErrorCode.forbidden);
      expect(h.adapter.requests, hasLength(1));
    }, session: sessionAt());

    netTest('TC-LIKE-010 404는 status 404 오류로 전달된다', (h, a) {
      h.adapter.on('PUT', _likesPath, [
        FakeResponse.fixture('like/posts-likes-put__404-not-found.json'),
      ]);
      final r = _put(h);
      advance(a, const Duration(seconds: 10));
      expect(_err(r).status, 404);
      expect(h.adapter.requests, hasLength(1));
    }, session: sessionAt());
  });

  group('재시도와 토큰 갱신', () {
    netTest('TC-LIKE-026 500이 두 번 뒤 200이면 0.5초·1초 뒤 재시도해 조용히 성공한다', (h, a) {
      h.adapter.on('PUT', _likesPath, [
        FakeResponse.fixture('like/posts-likes-put__500-server-error.json'),
        FakeResponse.fixture('like/posts-likes-put__500-server-error.json'),
        FakeResponse.fixture('like/posts-likes-put__liked.json'),
      ]);
      final r = _put(h);
      advance(a, const Duration(seconds: 2));
      expect(r.succeeded, isTrue);
      expect(h.adapter.requests.map((q) => q.at.difference(t0)).toList(), [
        Duration.zero,
        const Duration(milliseconds: 500),
        const Duration(milliseconds: 1500),
      ]);
    }, session: sessionAt());

    netTest('TC-LIKE-026 세 번 모두 실패하면 500 오류로 끝난다', (h, a) {
      h.adapter.on('PUT', _likesPath, [
        FakeResponse.fixture('like/posts-likes-put__500-server-error.json'),
      ]);
      final r = _put(h);
      advance(a, const Duration(seconds: 10));
      expect(_err(r).status, 500);
      expect(h.adapter.requests, hasLength(3));
    }, session: sessionAt());

    netTest('TC-LIKE-027 429의 Retry-After(1초)만큼 기다린 뒤 재시도한다', (h, a) {
      h.adapter.on('PUT', _likesPath, [
        FakeResponse.fixture('like/posts-likes-put__429-retry-after.json'),
        FakeResponse.fixture('like/posts-likes-put__liked.json'),
      ]);
      final r = _put(h);
      advance(a, const Duration(milliseconds: 999));
      expect(h.adapter.requests, hasLength(1));
      advance(a, const Duration(milliseconds: 1));
      expect(h.adapter.requests, hasLength(2));
      expect(
        h.adapter.requests[1].at.difference(t0),
        const Duration(seconds: 1),
      );
      advance(a, const Duration(seconds: 1));
      expect(r.succeeded, isTrue);
    }, session: sessionAt());

    netTest('TC-LIKE-028 연결이 끊기면 재시도 소진 뒤 network 오류다', (h, a) {
      h.adapter.on('PUT', _likesPath, [
        const FakeResponse.fault(FakeFault.disconnect),
      ]);
      final r = _put(h);
      advance(a, const Duration(seconds: 10));
      expect(_err(r).isNetwork, isTrue);
      expect(h.adapter.requests, hasLength(3));
    }, session: sessionAt());

    netTest('TC-LIKE-013 401 UNAUTHORIZED는 refresh 한 번 뒤 같은 요청을 1회 재전송한다', (
      h,
      a,
    ) {
      h.adapter.on('PUT', _likesPath, [
        FakeResponse.fixture('like/posts-likes-put__401-unauthorized.json'),
        FakeResponse.fixture('like/posts-likes-put__liked.json'),
      ]);
      h.adapter.on('POST', '$v1/auth/refresh', [
        FakeResponse.fixture('auth/refresh__success.json'),
      ]);
      final r = _put(h);
      advance(a, const Duration(seconds: 1));
      expect(r.succeeded, isTrue);
      expect(h.refreshCalls, 1);
      final puts = h.adapter.where('PUT', _likesPath).toList();
      expect(puts, hasLength(2));
      expect(puts[0].header('authorization'), 'Bearer at1');
      expect(puts[1].header('authorization'), 'Bearer fixture-access-token-2');
    }, session: sessionAt());
  });
}
