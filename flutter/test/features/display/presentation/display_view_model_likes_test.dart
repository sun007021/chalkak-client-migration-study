import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/display/domain/display_models.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/display_fakes.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show advance, settle;

final _yesterday = day('2026-10-26');
final _target = postIdOf(2); // 은행잎, 38개, 미좋아요

DisplayRig _rig({bool guest = false, bool manual = false, KstDate? date}) {
  final r = DisplayRig(guest: guest, manualLikes: manual, initialDate: date);
  r.repo.servePage(today, DisplaySort.recent, 1, recentP1Fx);
  r.repo.servePage(today, DisplaySort.popular, 1, popularP1Fx);
  r.repo.servePage(_yesterday, DisplaySort.popular, 1, popularP1Fx);
  r.likeRepo.seedServer(_target, likeCount: 38);
  return r;
}

void _load(FakeAsync async, DisplayRig r) {
  r.vm.load();
  settle(async);
}

void main() {
  group('좋아요', () {
    fakeTest('TC-LIKE-003 하트를 누르면 응답 전에 카드의 isLiked·likeCount가 바뀐다', (async) {
      final r = _rig(manual: true);
      _load(async, r);
      expect(r.card(_target).isLiked, isFalse);
      r.vm.onLikeTapped(_target);
      settle(async);
      expect(r.card(_target).isLiked, isTrue);
      expect(r.card(_target).likeCount, 39);
      expect(r.likeRepo.putCount, 1);
      r.likeRepo.calls.single.succeed(r.likeRepo, likeCount: 40, isLiked: true);
      settle(async);
      expect(r.card(_target).likeCount, 40);
    });

    fakeTest('TC-LIKE-004 같은 사진이 추천 카드와 그리드에 함께 있으면 두 곳이 항상 같은 값이다', (async) {
      final r = _rig(manual: true, date: _yesterday);
      _load(async, r);
      final id = r.featuredIds.first;
      r.likeRepo.seedServer(id, likeCount: r.card(id).likeCount);
      final before = r.card(id).likeCount;
      r.vm.onLikeTapped(id);
      settle(async);
      expect(r.state.featured.first.isLiked, isTrue);
      expect(r.state.featured.first.likeCount, before + 1);
      expect(r.card(id).isLiked, isTrue);
      expect(r.card(id).likeCount, before + 1);
      r.likeRepo.calls.single.fail(networkError());
      settle(async);
      expect(r.state.featured.first.isLiked, r.card(id).isLiked);
      expect(r.state.featured.first.likeCount, before);
    });

    fakeTest('TC-LIKE-009 실패하면 카드가 이전 값으로 돌아가고 토스트가 뜬다', (async) {
      final r = _rig(manual: true);
      _load(async, r);
      r.vm.onLikeTapped(_target);
      settle(async);
      r.likeRepo.calls.single.fail(
        errorFx('like/posts-likes-put__500-server-error.json'),
      );
      settle(async);
      expect(r.card(_target).isLiked, isFalse);
      expect(r.card(_target).likeCount, 38);
      expect(r.toastTexts, [Copy.likeErrorGeneric]);
    });

    fakeTest('TC-LIKE-010 404면 롤백하고 그 게시물을 목록·추천·캐시에서 뺀다', (async) {
      final r = _rig(manual: true);
      _load(async, r);
      r.vm.onLikeTapped(_target);
      settle(async);
      r.likeRepo.calls.single.fail(
        errorFx('like/posts-likes-put__404-not-found.json'),
      );
      settle(async);
      expect(r.itemIds, isNot(contains(_target)));
      expect(r.toastTexts, [Copy.likeErrorGeneric]);
      // 인기순 캐시가 있었어도 되살아나지 않는다.
      r.vm.selectSort(DisplaySort.popular);
      settle(async);
      expect(r.itemIds, isNot(contains(_target)));
    });

    fakeTest('TC-LIKE-014 게스트는 하트를 눌러도 상태 변화 없이 토스트만, 요청 0건', (async) {
      final r = _rig(guest: true, manual: true);
      _load(async, r);
      r.vm.onLikeTapped(_target);
      settle(async);
      expect(r.card(_target).isLiked, isFalse);
      expect(r.card(_target).likeCount, 38);
      expect(r.likeRepo.callCount, 0);
      expect(r.toastTexts, [Copy.guestLike]);
    });

    fakeTest('TC-LIKE-021 좋아요가 끝난 뒤 늦게 도착한 목록 재검증 응답이 좋아요 상태를 덮지 않는다', (async) {
      final r = _rig();
      _load(async, r);
      r.repo.onPosts(today, DisplaySort.recent, 1, [
        Reply.ok(pageFx(recentP1Fx), delay: const Duration(seconds: 2)),
      ]);
      r.vm.onTabReselected(); // 옛 값(미좋아요 38)을 싣고 올 응답
      advance(async, const Duration(milliseconds: 500));
      r.vm.onLikeTapped(_target);
      advance(async, const Duration(milliseconds: 500));
      expect(r.card(_target).isLiked, isTrue);
      advance(async, const Duration(seconds: 2));
      expect(r.state.isRefreshing, isFalse);
      expect(r.card(_target).isLiked, isTrue);
      expect(r.card(_target).likeCount, 39);
    });

    fakeTest('TC-LIKE-025 좋아요한 사진을 열면 상세 시드가 최신 좋아요 값이다(화면 간 공유 저장소)', (async) {
      final r = _rig();
      _load(async, r);
      r.vm.onLikeTapped(_target);
      settle(async);
      r.vm.onPostTapped(_target);
      settle(async);
      final seed = r.openedFeeds.single.seed!;
      expect(seed.isLiked, isTrue);
      expect(seed.likeCount, 39);
    });
  });

  group('삭제·제목 수정 이벤트', () {
    fakeTest('TC-FEED-044 삭제된 게시물은 목록에서 빠지고 늦은 재검증 응답이 되살리지 못한다', (async) {
      final r = _rig();
      _load(async, r);
      r.repo.onPosts(today, DisplaySort.recent, 1, [
        Reply.ok(pageFx(recentP1Fx), delay: const Duration(seconds: 1)),
      ]);
      r.vm.onReturnedFromFeed(); // 삭제 직전 시점에 보낸 재검증
      advance(async, const Duration(milliseconds: 300));
      r.bus.publishRemoved(_target);
      settle(async);
      expect(r.itemIds, isNot(contains(_target)));
      advance(async, const Duration(seconds: 2));
      expect(
        r.itemIds,
        isNot(contains(_target)),
        reason: '늦은 응답이 삭제한 글을 되살리면 안 된다',
      );
      // 다른 정렬 캐시에도 없다.
      r.vm.selectSort(DisplaySort.popular);
      settle(async);
      expect(r.itemIds, isNot(contains(_target)));
    });

    fakeTest('TC-FEED-036 삭제된 게시물은 아카이브 추천 카드에서도 빠진다', (async) {
      final r = _rig(date: _yesterday);
      _load(async, r);
      final id = r.featuredIds.first;
      r.bus.publishRemoved(id);
      settle(async);
      expect(r.featuredIds, isNot(contains(id)));
      expect(r.itemIds, isNot(contains(id)));
    });

    fakeTest('TC-FEED-024 제목이 수정되면 카드(그리드·캐시)에 새 제목이 반영된다', (async) {
      final r = _rig();
      _load(async, r);
      r.bus.publishTitleChanged(_target, '새 제목');
      settle(async);
      expect(r.card(_target).title, '새 제목');
      r.vm.selectSort(DisplaySort.popular);
      settle(async);
      expect(r.card(_target).title, '새 제목', reason: '다른 정렬 캐시에도 반영');
      r.bus.publishTitleChanged(_target, null);
      settle(async);
      expect(r.card(_target).title, isNull);
    });
  });
}
