import 'dart:math';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/features/like/domain/like_store.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/display_fakes.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show advance, settle;

const _id = myPostId;
const _idB = '22222222-2222-4222-8222-222222222202';

/// 첫 호출이 진행 중인 수동 모드 리그. 게시물은 (미좋아요, 10개)로 시작한다.
LikeRig _rig({bool guest = false}) {
  final r = LikeRig(guest: guest, manual: true);
  r.see(_id);
  return r;
}

LikeState _s(bool liked, int count) =>
    LikeState(isLiked: liked, likeCount: count);

void main() {
  group('낙관적 갱신', () {
    fakeTest(
      'TC-LIKE-003 하트를 누르면 응답 전에 isLiked=true, likeCount+1이고 PUT 1회가 나간다',
      (async) {
        final r = _rig();
        r.store.toggle(_id);
        settle(async);
        expect(r.store.stateOf(_id), _s(true, 11));
        expect(r.repo.calls.map((c) => c.like), [true]);
        expect(r.repo.calls.single.postId, _id);
      },
    );

    fakeTest('TC-LIKE-003 상태가 바뀌면 리스너에 알린다', (async) {
      final r = _rig();
      var notified = 0;
      r.store.addListener(() => notified++);
      r.store.toggle(_id);
      settle(async);
      expect(notified, greaterThan(0));
    });

    fakeTest('TC-LIKE-005 홈 랭킹 카드도 같은 저장소를 쓰므로 응답 값을 반영한 뒤 누르면 즉시 낙관 반영된다', (
      async,
    ) {
      // 홈 랭킹은 전시와 같은 LikeStore에 랭킹 응답 값을 reconcile한 뒤 toggle한다.
      final r = LikeRig(manual: true);
      r.repo.seedServer(_idB, likeCount: 38);
      r.store.reconcile(
        _idB,
        isLiked: false,
        likeCount: 38,
        since: r.store.version,
      );
      r.store.toggle(_idB);
      settle(async);
      expect(r.store.stateOf(_idB), _s(true, 39));
      expect(r.repo.putCount, 1);
    });

    fakeTest('TC-LIKE-007 좋아요한 사진을 다시 누르면 즉시 취소되고 DELETE가 나간다', (async) {
      final r = LikeRig(manual: true)..see(_id, isLiked: true, likeCount: 11);
      r.store.toggle(_id);
      settle(async);
      expect(r.store.stateOf(_id), _s(false, 10));
      expect(r.repo.calls.map((c) => c.like), [false]);
    });

    fakeTest('TC-LIKE-007 likeCount는 0 아래로 내려가지 않는다', (async) {
      final r = LikeRig(manual: true)..see(_id, isLiked: true, likeCount: 0);
      r.store.toggle(_id);
      settle(async);
      expect(r.store.stateOf(_id), _s(false, 0));
    });

    fakeTest('TC-LIKE-008 성공 응답의 likeCount·isLiked로 덮어쓴다(다른 사용자 동시 좋아요)', (
      async,
    ) {
      final r = _rig();
      final done = start(async, r.store.toggle(_id));
      expect(r.store.stateOf(_id), _s(true, 11));
      r.repo.calls.single.succeed(r.repo, likeCount: 13, isLiked: true);
      settle(async);
      expect(done.succeeded, isTrue);
      expect(r.store.stateOf(_id), _s(true, 13));
      expect(r.toasts, isEmpty);
    });

    fakeTest('TC-LIKE-033 이미 좋아요한 글의 PUT은 likeCount가 늘지 않아도 정상 성공이다', (async) {
      final r = _rig(); // 화면은 미좋아요 10, 서버는 이미 좋아요 10
      r.repo.seedServer(_id, isLiked: true, likeCount: 10);
      r.store.toggle(_id);
      settle(async);
      r.repo.calls.single.succeed(r.repo);
      settle(async);
      expect(r.store.stateOf(_id), _s(true, 10));
      expect(r.toasts, isEmpty);
    });

    fakeTest('TC-LIKE-033 좋아요 안 한 글의 DELETE도 isLiked=false로 정상이다', (async) {
      final r = LikeRig(manual: true)..see(_id, isLiked: true, likeCount: 11);
      r.repo.seedServer(_id, isLiked: false, likeCount: 10);
      r.store.toggle(_id);
      settle(async);
      r.repo.calls.single.succeed(r.repo);
      settle(async);
      expect(r.store.stateOf(_id), _s(false, 10));
      expect(r.toasts, isEmpty);
    });

    fakeTest('TC-LIKE-032 작성자 본인의 게시물도 누를 수 있다', (async) {
      // 좋아요 저장소는 작성자를 구분하지 않는다. myPostId는 내 게시물이다.
      final r = _rig();
      r.store.toggle(myPostId);
      settle(async);
      expect(r.repo.callCount, 1);
      expect(r.store.stateOf(myPostId), _s(true, 11));
    });
  });

  group('실패와 롤백', () {
    fakeTest('TC-LIKE-009 500이면 이전 상태로 되돌리고 토스트 한 번', (async) {
      final r = _rig();
      r.store.toggle(_id);
      settle(async);
      r.repo.calls.single.fail(
        errorFx('like/posts-likes-put__500-server-error.json'),
      );
      settle(async);
      expect(r.store.stateOf(_id), _s(false, 10));
      expect(r.toastTexts, [Copy.likeErrorGeneric]);
    });

    fakeTest('TC-LIKE-009 취소(DELETE) 실패도 되돌리고 같은 토스트', (async) {
      final r = LikeRig(manual: true)..see(_id, isLiked: true, likeCount: 11);
      r.store.toggle(_id);
      settle(async);
      r.repo.calls.single.fail(networkError());
      settle(async);
      expect(r.store.stateOf(_id), _s(true, 11));
      expect(r.toastTexts, [Copy.likeErrorGeneric]);
    });

    fakeTest('TC-LIKE-028 오프라인(연결 실패)이면 롤백 + 토스트 한 번', (async) {
      final r = _rig();
      r.store.toggle(_id);
      settle(async);
      r.repo.calls.single.fail(networkError());
      settle(async);
      expect(r.store.stateOf(_id), _s(false, 10));
      expect(r.toastTexts, [Copy.likeErrorGeneric]);
    });

    fakeTest('TC-LIKE-009 계약 위반(invalidResponse)도 실패로 롤백한다', (async) {
      final r = _rig();
      r.store.toggle(_id);
      settle(async);
      r.repo.calls.single.fail(ApiError.invalidResponse());
      settle(async);
      expect(r.store.stateOf(_id), _s(false, 10));
      expect(r.toastTexts, [Copy.likeErrorGeneric]);
    });

    fakeTest('TC-LIKE-010 404면 롤백하고 목록에서 뺄 이벤트를 내고 토스트를 띄운다', (async) {
      final r = _rig();
      r.store.toggle(_id);
      settle(async);
      r.repo.calls.single.fail(
        errorFx('like/posts-likes-put__404-not-found.json'),
      );
      settle(async);
      expect(r.store.stateOf(_id), _s(false, 10));
      expect(r.removedIds, [_id]);
      expect(r.bus.isRemoved(_id), isTrue);
      expect(r.toastTexts, [Copy.likeErrorGeneric]);
    });

    fakeTest('TC-LIKE-011 정지 회원의 등록 403은 롤백 + 정지 문구, 같은 요청을 다시 보내지 않는다', (
      async,
    ) {
      final r = _rig();
      r.store.toggle(_id);
      settle(async);
      r.repo.calls.single.fail(
        errorFx('like/posts-likes-put__403-banned.json'),
      );
      advance(async, const Duration(seconds: 5));
      expect(r.store.stateOf(_id), _s(false, 10));
      expect(r.toastTexts, [Copy.likeErrorBanned]);
      expect(r.repo.callCount, 1);
    });

    fakeTest('TC-LIKE-012 정지 회원도 이미 한 좋아요를 취소(DELETE)할 수 있다', (async) {
      final r = LikeRig(manual: true)..see(_id, isLiked: true, likeCount: 11);
      r.store.toggle(_id);
      settle(async);
      r.repo.calls.single.succeed(r.repo);
      settle(async);
      expect(r.store.stateOf(_id), _s(false, 10));
      expect(r.toasts, isEmpty);
    });

    fakeTest('TC-LIKE-013 401은 롤백만 하고 토스트는 없다(로그인 이동은 세션 해제가 맡는다)', (async) {
      final r = _rig();
      r.store.toggle(_id);
      settle(async);
      r.repo.calls.single.fail(
        errorFx('like/posts-likes-put__401-unauthorized.json'),
      );
      settle(async);
      expect(r.store.stateOf(_id), _s(false, 10));
      expect(r.toasts, isEmpty);
    });
  });

  group('게스트', () {
    fakeTest('TC-LIKE-014 게스트는 상태 변화 없이 토스트만, 요청 0건', (async) {
      final r = LikeRig(guest: true, manual: true)..see(_id);
      r.store.toggle(_id);
      settle(async);
      expect(r.store.stateOf(_id), _s(false, 10));
      expect(r.repo.callCount, 0);
      expect(r.toastTexts, [Copy.guestLike]);
    });

    fakeTest('TC-LIKE-014 게스트가 연달아 눌러도 요청은 0건, 토스트는 누른 횟수만큼', (async) {
      final r = LikeRig(guest: true, manual: true)..see(_id);
      r.store.toggle(_id);
      r.store.toggle(_id);
      settle(async);
      expect(r.repo.callCount, 0);
      expect(r.toastTexts, [Copy.guestLike, Copy.guestLike]);
      expect(r.toasts[0].id, isNot(r.toasts[1].id));
    });
  });

  group('연타와 직렬화', () {
    fakeTest('TC-LIKE-015 on-off-on 3회 연타는 요청을 쌓지 않고 PUT 1회로 끝난다', (async) {
      final r = _rig();
      r.store.toggle(_id);
      r.store.toggle(_id);
      r.store.toggle(_id);
      settle(async);
      expect(r.repo.callCount, 1);
      expect(r.store.stateOf(_id), _s(true, 11));
      r.repo.calls.single.succeed(r.repo);
      settle(async);
      expect(r.repo.callCount, 1);
      expect(r.repo.putCount, 1);
      expect(r.store.stateOf(_id), _s(true, 11));
      expect(r.toasts, isEmpty);
    });

    fakeTest('TC-LIKE-016 on-off 2회 연타는 PUT 응답 뒤 DELETE를 한 번 더 보내 최종 off', (
      async,
    ) {
      final r = _rig();
      final done = start(async, () async {
        final a = r.store.toggle(_id);
        final b = r.store.toggle(_id);
        await Future.wait([a, b]);
      }());
      expect(r.repo.callCount, 1);
      r.repo.calls[0].succeed(r.repo);
      settle(async);
      expect(r.repo.callCount, 2);
      expect(r.repo.calls[1].like, isFalse);
      r.repo.calls[1].succeed(r.repo);
      settle(async);
      expect(done.succeeded, isTrue);
      expect(r.store.stateOf(_id), _s(false, 10));
      expect(r.repo.server[_id]!.isLiked, isFalse);
      expect(r.repo.maxInFlightByPost, 1);
    });

    fakeTest('TC-LIKE-018 PUT 진행 중 같은 하트를 또 눌러도 중복 요청이 나가지 않는다', (async) {
      final r = _rig();
      r.store.toggle(_id);
      settle(async);
      r.store.toggle(_id);
      settle(async);
      expect(r.repo.callCount, 1);
      expect(r.repo.maxInFlightByPost, 1);
    });

    fakeTest(
      'TC-LIKE-017 임의 탭 순서(길이 1~9)와 지연에서도 동시 진행 ≤1이고 최종 서버 상태가 마지막 의도와 같다',
      (async) {
        for (var seed = 0; seed < 6; seed++) {
          for (var taps = 1; taps <= 9; taps++) {
            final random = Random(seed * 100 + taps);
            final r = LikeRig()..see(_id);
            r.repo.delay = Duration(milliseconds: 20 + random.nextInt(200));
            for (var i = 0; i < taps; i++) {
              r.store.toggle(_id);
              advance(async, Duration(milliseconds: random.nextInt(150)));
            }
            advance(async, const Duration(seconds: 10));
            final wantLiked = taps.isOdd;
            expect(
              r.repo.maxInFlightByPost,
              lessThanOrEqualTo(1),
              reason: '$seed/$taps',
            );
            expect(
              r.repo.server[_id]!.isLiked,
              wantLiked,
              reason: '$seed/$taps',
            );
            expect(
              r.store.stateOf(_id)!.isLiked,
              wantLiked,
              reason: '$seed/$taps',
            );
            expect(
              r.store.stateOf(_id)!.likeCount,
              r.repo.server[_id]!.likeCount,
              reason: '$seed/$taps',
            );
          }
        }
      },
    );

    fakeTest('TC-LIKE-019 서로 다른 두 사진은 독립적으로 병렬 요청되고 한쪽 실패가 다른 쪽에 영향이 없다', (
      async,
    ) {
      final r = _rig()..see(_idB, likeCount: 38);
      r.store.toggle(_id);
      r.store.toggle(_idB);
      settle(async);
      expect(r.repo.callCount, 2);
      expect(r.repo.calls.map((c) => c.postId).toSet(), {_id, _idB});
      r.repo.calls[0].fail(networkError());
      settle(async);
      expect(r.store.stateOf(_id), _s(false, 10));
      expect(r.store.stateOf(_idB), _s(true, 39));
      r.repo.calls[1].succeed(r.repo);
      settle(async);
      expect(r.store.stateOf(_idB), _s(true, 39));
    });

    fakeTest('TC-LIKE-020 PUT 진행 중 다시 눌러 의도=off일 때 PUT이 실패하면 추가 요청 없이 토스트만', (
      async,
    ) {
      final r = _rig();
      r.store.toggle(_id);
      r.store.toggle(_id);
      settle(async);
      r.repo.calls.single.fail(networkError());
      advance(async, const Duration(seconds: 5));
      expect(r.repo.callCount, 1);
      expect(r.store.stateOf(_id), _s(false, 10));
      expect(r.toastTexts, [Copy.likeErrorGeneric]);
    });

    fakeTest('TC-LIKE-022 실패한 요청의 롤백이 그 뒤의 새 의도를 되돌리지 않고, 남은 의도를 한 번 더 보낸다', (
      async,
    ) {
      final r = _rig();
      final seen = <LikeState?>[];
      r.store.addListener(() => seen.add(r.store.stateOf(_id)));
      r.store.toggle(_id); // on  -> PUT 진행
      r.store.toggle(_id); // off
      r.store.toggle(_id); // on  (최종 의도)
      settle(async);
      seen.clear();
      r.repo.calls[0].fail(networkError());
      settle(async);
      expect(
        seen,
        isNot(contains(_s(false, 10))),
        reason: '새 의도(on)가 롤백으로 번쩍 꺼지면 안 된다',
      );
      expect(r.repo.callCount, 2);
      expect(r.repo.calls[1].like, isTrue);
      r.repo.calls[1].succeed(r.repo);
      settle(async);
      expect(r.store.stateOf(_id), _s(true, 11));
    });
  });

  group('재검증과 병합', () {
    fakeTest('TC-LIKE-021 좋아요 완료 뒤 도착한 이전 시점의 목록 재검증 값은 상태를 덮지 않는다', (async) {
      final r = _rig();
      final since = r.store.version; // 재검증 요청을 보내는 시점
      r.store.toggle(_id);
      settle(async);
      r.repo.calls.single.succeed(r.repo);
      settle(async);
      final shown = r.store.reconcile(
        _id,
        isLiked: false,
        likeCount: 10,
        since: since,
      );
      expect(shown, _s(true, 11));
      expect(r.store.stateOf(_id), _s(true, 11));
    });

    fakeTest('TC-LIKE-021 요청이 진행 중인 게시물에는 재검증 값을 적용하지 않는다', (async) {
      final r = _rig();
      r.store.toggle(_id);
      settle(async);
      final shown = r.store.reconcile(
        _id,
        isLiked: false,
        likeCount: 10,
        since: r.store.version,
      );
      expect(shown, _s(true, 11));
    });

    fakeTest('TC-LIKE-021 좋아요 변경이 없었다면 재검증 값을 그대로 받아들인다', (async) {
      final r = _rig();
      final shown = r.store.reconcile(
        _id,
        isLiked: true,
        likeCount: 12,
        since: r.store.version,
      );
      expect(shown, _s(true, 12));
      expect(r.store.stateOf(_id), _s(true, 12));
    });

    fakeTest('TC-LIKE-021 처음 보는 게시물은 응답 값으로 채운다', (async) {
      final r = _rig();
      expect(r.store.stateOf(_idB), isNull);
      r.store.reconcile(
        _idB,
        isLiked: true,
        likeCount: 5,
        since: r.store.version,
      );
      expect(r.store.stateOf(_idB), _s(true, 5));
    });

    fakeTest('TC-LIKE-022 실패 롤백 뒤에 도착한 이전 시점 재검증 값도 롤백된 값을 덮지 않는다', (async) {
      final r = _rig();
      final since = r.store.version;
      r.store.toggle(_id);
      settle(async);
      r.repo.calls.single.fail(networkError());
      settle(async);
      final shown = r.store.reconcile(
        _id,
        isLiked: true,
        likeCount: 99,
        since: since,
      );
      expect(shown, _s(false, 10));
    });
  });

  group('수명', () {
    fakeTest('TC-LIKE-029 화면이 보이지 않아(구독 없음) 토스트가 버려져도 상태는 캐시에 반영된다', (async) {
      final r = LikeRig(manual: true, listen: false)..see(_id);
      r.store.toggle(_id);
      settle(async);
      r.repo.calls.single.fail(networkError());
      settle(async);
      expect(r.store.stateOf(_id), _s(false, 10));
      final late = <Object>[];
      r.store.toasts.listen(late.add);
      settle(async);
      expect(late, isEmpty, reason: '나중에 구독해도 옛 토스트가 되살아나지 않는다');
    });

    fakeTest('TC-LIKE-030 서로 다른 두 사진이 연달아 실패하면 같은 문구 토스트가 두 번 모두 뜬다(고유 id)', (
      async,
    ) {
      final r = _rig()..see(_idB, likeCount: 38);
      r.store.toggle(_id);
      r.store.toggle(_idB);
      settle(async);
      r.repo.calls[0].fail(networkError());
      r.repo.calls[1].fail(networkError());
      settle(async);
      expect(r.toastTexts, [Copy.likeErrorGeneric, Copy.likeErrorGeneric]);
      expect(r.toasts[0].id, isNot(r.toasts[1].id));
    });

    fakeTest('TC-LIKE-031 사용자 A의 응답 도중 reset(로그아웃)하면 A의 응답은 무시된다', (async) {
      final r = _rig();
      r.store.toggle(_id);
      settle(async);
      r.store.reset();
      expect(r.store.stateOf(_id), isNull);
      r.repo.calls.single.succeed(r.repo);
      settle(async);
      expect(r.store.stateOf(_id), isNull, reason: 'B 화면은 서버 값으로만 채워진다');
      r.store.reconcile(
        _id,
        isLiked: false,
        likeCount: 3,
        since: r.store.version,
      );
      expect(r.store.stateOf(_id), _s(false, 3));
    });

    fakeTest('TC-LIKE-031 reset 뒤에 도착한 A의 실패는 롤백도 토스트도 만들지 않는다', (async) {
      final r = _rig();
      r.store.toggle(_id);
      settle(async);
      r.store.reset();
      r.store.reconcile(
        _id,
        isLiked: true,
        likeCount: 7,
        since: r.store.version,
      );
      r.repo.calls.single.fail(networkError());
      settle(async);
      expect(r.store.stateOf(_id), _s(true, 7));
      expect(r.toasts, isEmpty);
    });

    fakeTest('값을 본 적 없는 게시물을 누르면 요청 없이 무시한다', (async) {
      final r = _rig();
      r.store.toggle(_idB);
      settle(async);
      expect(r.repo.callCount, 0);
    });
  });
}
