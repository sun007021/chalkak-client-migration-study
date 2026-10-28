import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/display/domain/display_models.dart';
import 'package:chalkak/features/display/presentation/display_view_model.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/display_fakes.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show advance, settle;

final _yesterday = day('2026-10-26');
const _seed = 'seed_abc123';

/// 오늘 최신·인기·랜덤(1~2페이지)과 어제 인기순을 걸어 둔 리그.
DisplayRig _rig({
  KstDate? date,
  DisplaySort sort = DisplaySort.recent,
  bool guest = false,
}) {
  final r = DisplayRig(initialDate: date, initialSort: sort, guest: guest);
  r.repo.servePage(today, DisplaySort.recent, 1, recentP1Fx);
  r.repo.servePage(today, DisplaySort.recent, 2, recentP2Fx);
  r.repo.servePage(today, DisplaySort.popular, 1, popularP1Fx);
  r.repo.servePage(today, DisplaySort.random, 1, randomP1Fx);
  r.repo.servePage(today, DisplaySort.random, 2, randomP2Fx);
  r.repo.servePage(_yesterday, DisplaySort.popular, 1, popularP1Fx);
  return r;
}

void _load(FakeAsync async, DisplayRig r) {
  r.vm.load();
  settle(async);
}

void _scroll(FakeAsync async, DisplayRig r, int index) {
  r.vm.onVisibleIndexChanged(index);
  settle(async);
}

PostPage _reversed(PostPage p) => PostPage(
  currentPage: p.currentPage,
  pageSize: p.pageSize,
  hasNext: p.hasNext,
  randomSeed: p.randomSeed,
  posts: p.posts.reversed.toList(),
);

void main() {
  group('정렬', () {
    fakeTest('TC-DISP-011 오늘은 정렬 탭을 보이고 기본은 최신순이며 선택에 따라 sort가 요청된다', (async) {
      final r = _rig();
      _load(async, r);
      expect(r.state.showSortTabs, isTrue);
      expect(r.state.sort, DisplaySort.recent);
      expect(r.repo.postsCalls.map((c) => c.sort), [DisplaySort.recent]);
      r.vm.selectSort(DisplaySort.popular);
      settle(async);
      expect(r.state.sort, DisplaySort.popular);
      expect(r.repo.postsCalls.last.sort, DisplaySort.popular);
      expect(r.itemIds, idsOf(popularP1Fx));
      r.vm.selectSort(DisplaySort.random);
      settle(async);
      expect(r.repo.postsCalls.last.sort, DisplaySort.random);
      expect(r.itemIds, idsOf(randomP1Fx));
    });

    fakeTest('REQ-DISP-016 initialSort로 열면 그 정렬로 연다', (async) {
      final r = _rig(sort: DisplaySort.popular);
      _load(async, r);
      expect(r.state.sort, DisplaySort.popular);
      expect(r.repo.postsCalls.single.sort, DisplaySort.popular);
    });

    fakeTest('TC-DISP-012 정렬을 바꾸면 새 결과가 올 때까지 기존 사진을 유지한다', (async) {
      final r = _rig();
      _load(async, r);
      r.repo.onPosts(today, DisplaySort.popular, 1, [
        Reply.ok(pageFx(popularP1Fx), delay: const Duration(seconds: 1)),
      ]);
      r.vm.selectSort(DisplaySort.popular);
      advance(async, const Duration(milliseconds: 500));
      expect(r.itemIds, idsOf(recentP1Fx));
      expect(r.state.status, DisplayStatus.content);
      expect(r.state.isRefreshing, isTrue);
      advance(async, const Duration(seconds: 1));
      expect(r.itemIds, idsOf(popularP1Fx));
      expect(r.state.isRefreshing, isFalse);
    });

    fakeTest('TC-DISP-012 이미 본 (날짜, 정렬)을 다시 고르면 캐시를 즉시 보여 준 뒤 재검증한다', (async) {
      final r = _rig();
      _load(async, r);
      r.vm.selectSort(DisplaySort.popular);
      settle(async);
      r.repo.onPosts(today, DisplaySort.recent, 1, [
        Reply.ok(pageFx(recentP1Fx), delay: const Duration(seconds: 1)),
      ]);
      final before = r.repo.callsFor(DisplaySort.recent).length;
      r.vm.selectSort(DisplaySort.recent);
      settle(async);
      expect(r.itemIds, idsOf(recentP1Fx), reason: '캐시를 응답 전에 바로 보여 준다');
      expect(r.state.isRefreshing, isTrue);
      expect(r.repo.callsFor(DisplaySort.recent), hasLength(before + 1));
      advance(async, const Duration(seconds: 2));
      expect(r.state.isRefreshing, isFalse);
    });

    fakeTest('TC-DISP-012 처음 보는 정렬만 로딩 표시가 아니라 기존 사진 위에서 불러온다', (async) {
      final r = _rig();
      _load(async, r);
      r.vm.selectSort(DisplaySort.popular);
      expect(r.state.status, DisplayStatus.content);
    });

    fakeTest('TC-DISP-047 정렬 A→B 빠른 전환에서 A의 늦은 응답은 B 화면을 덮지 않고 캐시에만 남는다', (
      async,
    ) {
      final r = _rig();
      _load(async, r);
      r.repo.onPosts(today, DisplaySort.popular, 1, [
        Reply.ok(pageFx(popularP1Fx), delay: const Duration(seconds: 3)),
      ]);
      r.repo.onPosts(today, DisplaySort.random, 1, [
        Reply.ok(pageFx(randomP1Fx), delay: const Duration(seconds: 1)),
      ]);
      r.vm.selectSort(DisplaySort.popular);
      r.vm.selectSort(DisplaySort.random);
      advance(async, const Duration(seconds: 1));
      expect(r.state.sort, DisplaySort.random);
      expect(r.itemIds, idsOf(randomP1Fx));
      advance(async, const Duration(seconds: 3));
      expect(
        r.itemIds,
        idsOf(randomP1Fx),
        reason: 'A(popular)의 늦은 응답이 덮으면 안 된다',
      );
      // A의 결과는 캐시에 남아 있어 다시 고르면 바로 보인다.
      r.repo.onPosts(today, DisplaySort.popular, 1, [
        Reply.ok(pageFx(popularP1Fx), delay: const Duration(seconds: 5)),
      ]);
      r.vm.selectSort(DisplaySort.popular);
      settle(async);
      expect(r.itemIds, idsOf(popularP1Fx));
    });
  });

  group('아카이브', () {
    fakeTest(
      'TC-DISP-013 지난 날짜는 popular 고정, 정렬 탭 숨김, 상위 5장 추천 + 전체 그리드, 헤더 문구',
      (async) {
        final r = _rig(date: _yesterday);
        _load(async, r);
        expect(r.state.isArchive, isTrue);
        expect(r.state.showSortTabs, isFalse);
        expect(r.repo.postsCalls.map((c) => c.sort).toSet(), {
          DisplaySort.popular,
        });
        expect(r.featuredIds, idsOf(popularP1Fx).take(5).toList());
        expect(r.itemIds, idsOf(popularP1Fx));
        expect(r.state.description, Copy.displayHeaderDescArchive);
      },
    );

    fakeTest('TC-DISP-013 오늘 날짜의 설명은 "같은 주제에서 다른 시선을 느껴보세요"이고 추천 카드는 없다', (
      async,
    ) {
      final r = _rig();
      _load(async, r);
      expect(r.state.description, Copy.displayHeaderDescLatest);
      expect(r.state.featured, isEmpty);
    });

    fakeTest('TC-DISP-014 오늘에서 랜덤순을 보다 지난 날짜로 갔다 돌아오면 랜덤순이 복원된다', (async) {
      final r = _rig();
      _load(async, r);
      r.vm.selectSort(DisplaySort.random);
      settle(async);
      r.vm.goPrevious();
      settle(async);
      expect(r.repo.postsCalls.last.sort, DisplaySort.popular);
      r.vm.goNext();
      settle(async);
      expect(r.state.selectedDate, today);
      expect(r.state.sort, DisplaySort.random);
      expect(r.repo.postsCalls.last.sort, DisplaySort.random);
      expect(r.state.showSortTabs, isTrue);
    });

    fakeTest('TC-DISP-042 같은 날짜 재검증은 추천 카드 페이지를 유지하고 다른 날짜로 가면 처음으로 돌린다', (
      async,
    ) {
      final r = _rig(date: _yesterday);
      r.repo.servePage(day('2026-10-25'), DisplaySort.popular, 1, popularP1Fx);
      _load(async, r);
      r.vm.onFeaturedPageChanged(3);
      expect(r.state.featuredPage, 3);
      r.vm.onTabReselected();
      settle(async);
      expect(r.state.featuredPage, 3);
      r.vm.goPrevious();
      settle(async);
      expect(r.state.featuredPage, 0);
    });

    fakeTest('TC-DISP-043 아카이브 사진이 5개 미만이면 있는 만큼만 추천에 쓰고 깨지지 않는다', (async) {
      final r = _rig(date: _yesterday);
      r.repo.servePage(_yesterday, DisplaySort.popular, 1, popular3Fx);
      _load(async, r);
      expect(r.state.status, DisplayStatus.content);
      expect(r.featuredIds, idsOf(popular3Fx));
      expect(r.itemIds, idsOf(popular3Fx));
    });
  });

  group('랜덤 시드', () {
    fakeTest('TC-DISP-015 랜덤 첫 페이지는 시드 없이 요청하고 응답 시드를 2페이지부터 보낸다', (async) {
      final r = _rig(sort: DisplaySort.random);
      _load(async, r);
      expect(r.repo.postsCalls.single.randomSeed, isNull);
      _scroll(async, r, 19);
      expect(r.repo.postsCalls.last.page, 2);
      expect(r.repo.postsCalls.last.randomSeed, _seed);
    });

    fakeTest('TC-DISP-016 시드 없이 2페이지를 요청하는 일이 없다', (async) {
      final r = _rig(sort: DisplaySort.random);
      _load(async, r);
      _scroll(async, r, 19);
      for (final c in r.repo.postsCalls.where((c) => c.page >= 2)) {
        expect(c.randomSeed, isNotNull);
      }
    });

    fakeTest('TC-DISP-017 랜덤 첫 페이지 재검증도 저장한 시드를 보내고 같은 시드의 뒤쪽 페이지를 유지한다', (
      async,
    ) {
      final r = _rig(sort: DisplaySort.random);
      _load(async, r);
      _scroll(async, r, 19);
      final loaded = r.itemIds;
      expect(loaded.length, greaterThan(20));
      r.vm.onTabReselected();
      settle(async);
      final reval = r.repo.postsCalls.last;
      expect(reval.page, 1);
      expect(reval.randomSeed, _seed);
      expect(r.itemIds, loaded);
    });

    fakeTest('TC-DISP-018 랜덤에서 최신·인기로 바꾸면 시드를 버리고 이후 요청에 시드를 싣지 않는다', (async) {
      final r = _rig(sort: DisplaySort.random);
      _load(async, r);
      r.vm.selectSort(DisplaySort.recent);
      settle(async);
      _scroll(async, r, 19);
      r.vm.selectSort(DisplaySort.popular);
      settle(async);
      for (final c in r.repo.postsCalls.where(
        (c) => c.sort != DisplaySort.random,
      )) {
        expect(c.randomSeed, isNull, reason: '$c');
      }
      r.vm.selectSort(DisplaySort.random);
      settle(async);
      expect(r.repo.postsCalls.last.sort, DisplaySort.random);
      expect(
        r.repo.postsCalls.last.randomSeed,
        isNull,
        reason: '버린 시드를 다시 쓰지 않는다',
      );
    });

    fakeTest('TC-DISP-019 랜덤 응답에 시드가 없으면 2페이지 요청을 보내지 않는다', (async) {
      final r = _rig(sort: DisplaySort.random);
      r.repo.servePage(today, DisplaySort.random, 1, randomNoSeedFx);
      _load(async, r);
      _scroll(async, r, 19);
      _scroll(async, r, 19);
      expect(r.repo.postsCalls, hasLength(1));
      expect(r.state.isPaging, isFalse);
    });

    fakeTest('TC-DISP-020 랜덤 페이지 경계에서 겹치는 게시물 id는 한 번만 보여 준다', (async) {
      final r = _rig(sort: DisplaySort.random);
      r.repo.servePage(today, DisplaySort.random, 2, randomP2OverlapFx);
      _load(async, r);
      _scroll(async, r, 19);
      final p1 = idsOf(randomP1Fx);
      final p2 = idsOf(randomP2OverlapFx);
      expect(p2.where(p1.contains), isNotEmpty, reason: 'fixture에 중복이 있어야 한다');
      expect(r.itemIds.toSet(), hasLength(r.itemIds.length));
      expect(r.itemIds, [...p1, ...p2.where((id) => !p1.contains(id))]);
    });

    fakeTest('TC-DISP-021 날짜를 바꿔 처음 불러오는 페이지는 시드 없이 요청한다', (async) {
      final r = _rig(sort: DisplaySort.random);
      _load(async, r);
      r.vm.goPrevious();
      settle(async);
      final onYesterday = r.repo.postsCalls.where((c) => c.date == _yesterday);
      expect(onYesterday, isNotEmpty);
      expect(onYesterday.every((c) => c.randomSeed == null), isTrue);
    });

    fakeTest(
      'TC-DISP-045 피드에서 돌아오면 시드와 페이지 꼬리를 유지한 채 재검증하고 다음 페이지도 같은 시드로 요청한다',
      (async) {
        final r = _rig(sort: DisplaySort.random);
        _load(async, r);
        _scroll(async, r, 19);
        final loaded = r.itemIds;
        r.vm.onReturnedFromFeed();
        settle(async);
        expect(r.repo.postsCalls.last.page, 1);
        expect(r.repo.postsCalls.last.randomSeed, _seed);
        expect(r.itemIds, loaded);
        expect(r.state.sort, DisplaySort.random);
        expect(r.scrollToTopCount, 0, reason: '피드 복귀는 위치를 유지한다');
      },
    );
  });

  group('페이징', () {
    fakeTest('TC-DISP-022 끝에서 세 번째 항목 이내에 닿으면 다음 페이지를 한 번만 요청해 이어 붙인다', (
      async,
    ) {
      final r = _rig();
      _load(async, r);
      _scroll(async, r, 16);
      expect(r.repo.postsCalls, hasLength(1), reason: '마지막에서 네 번째는 아직이다');
      r.repo.onPosts(today, DisplaySort.recent, 2, [
        Reply.ok(pageFx(recentP2Fx), delay: const Duration(seconds: 1)),
      ]);
      _scroll(async, r, 17);
      expect(r.repo.postsCalls.last.page, 2);
      expect(r.state.isPaging, isTrue);
      _scroll(async, r, 19);
      _scroll(async, r, 18);
      expect(r.repo.postsCalls.where((c) => c.page == 2), hasLength(1));
      advance(async, const Duration(seconds: 2));
      expect(r.state.isPaging, isFalse);
      expect(r.itemIds, [...idsOf(recentP1Fx), ...idsOf(recentP2Fx)]);
    });

    fakeTest('TC-DISP-023 hasNext=false면 끝에 닿아도 요청이 없다', (async) {
      final r = _rig();
      _load(async, r);
      _scroll(async, r, 19);
      expect(r.state.hasNext, isFalse);
      final calls = r.repo.postsCalls.length;
      _scroll(async, r, 26);
      _scroll(async, r, 25);
      expect(r.repo.postsCalls, hasLength(calls));
    });

    fakeTest('TC-DISP-023 다음 페이지가 빈 posts·hasNext=false여도 오류 없이 처리한다', (async) {
      final r = _rig();
      r.repo.servePage(today, DisplaySort.recent, 2, page99Fx);
      _load(async, r);
      _scroll(async, r, 19);
      expect(r.state.status, DisplayStatus.content);
      expect(r.itemIds, idsOf(recentP1Fx));
      expect(r.state.hasNext, isFalse);
      expect(r.toastTexts, isEmpty);
    });

    fakeTest('TC-DISP-024 첫 페이지 재검증 중에는 다음 페이지를 요청하지 않는다', (async) {
      final r = _rig();
      _load(async, r);
      r.repo.onPosts(today, DisplaySort.recent, 1, [
        Reply.ok(pageFx(recentP1Fx), delay: const Duration(seconds: 1)),
      ]);
      r.vm.onTabReselected();
      settle(async);
      expect(r.state.isRefreshing, isTrue);
      _scroll(async, r, 19);
      expect(r.repo.postsCalls.where((c) => c.page == 2), isEmpty);
    });

    fakeTest('TC-DISP-025 2페이지까지 캐시된 뒤 첫 페이지만 재검증해도 캐시된 다음 페이지는 유지된다', (async) {
      final r = _rig();
      _load(async, r);
      _scroll(async, r, 19);
      expect(r.itemIds, hasLength(27));
      r.vm.onTabReselected();
      settle(async);
      expect(r.itemIds, [...idsOf(recentP1Fx), ...idsOf(recentP2Fx)]);
      expect(r.state.isRefreshing, isFalse);
    });

    fakeTest('TC-DISP-026 다음 페이지가 실패하면 토스트 후 같은 page를 다시 요청하고 기존 사진은 유지된다', (
      async,
    ) {
      final r = _rig();
      _load(async, r);
      r.repo.onPosts(today, DisplaySort.recent, 2, [
        Reply.fail(errorFx(posts500Fx)),
        Reply.ok(pageFx(recentP2Fx)),
      ]);
      _scroll(async, r, 19);
      expect(r.itemIds, idsOf(recentP1Fx));
      expect(r.state.status, DisplayStatus.content);
      expect(r.state.isPaging, isFalse);
      expect(r.toastTexts, [Copy.displayError]);
      _scroll(async, r, 19);
      expect(r.repo.postsCalls.where((c) => c.page == 2), hasLength(2));
      expect(r.itemIds, hasLength(27));
    });

    fakeTest('TC-DISP-027 페이지 사이 새 글로 밀려 같은 id가 겹치면 한 번만 보여 준다', (async) {
      final r = _rig();
      r.repo.servePage(today, DisplaySort.recent, 2, recentP2OverlapFx);
      _load(async, r);
      _scroll(async, r, 19);
      final p1 = idsOf(recentP1Fx);
      final p2 = idsOf(recentP2OverlapFx);
      expect(p2.where(p1.contains), isNotEmpty);
      expect(r.itemIds.toSet(), hasLength(r.itemIds.length));
      expect(r.itemIds, [...p1, ...p2.where((id) => !p1.contains(id))]);
    });
  });

  group('새로고침', () {
    fakeTest('TC-DISP-044 탭을 다시 누르면 맨 위로 이동 이벤트를 내고 기존 전시를 유지한 채 재검증해 교체한다', (
      async,
    ) {
      final r = _rig();
      _load(async, r);
      r.repo.onPosts(today, DisplaySort.recent, 1, [
        Reply.ok(
          _reversed(pageFx(recentP1Fx)),
          delay: const Duration(seconds: 1),
        ),
      ]);
      r.vm.onTabReselected();
      advance(async, const Duration(milliseconds: 500));
      expect(r.scrollToTopCount, 1);
      expect(r.state.isRefreshing, isTrue);
      expect(r.itemIds, idsOf(recentP1Fx));
      advance(async, const Duration(seconds: 1));
      expect(r.state.isRefreshing, isFalse);
      expect(r.itemIds, idsOf(recentP1Fx).reversed.toList());
    });

    fakeTest('TC-DISP-044 재검증이 실패하면 기존 전시를 유지하고 토스트만 띄운다', (async) {
      final r = _rig();
      _load(async, r);
      r.repo.onPosts(today, DisplaySort.recent, 1, [
        Reply.fail(errorFx(posts500Fx)),
      ]);
      r.vm.onTabReselected();
      settle(async);
      expect(r.state.status, DisplayStatus.content);
      expect(r.itemIds, idsOf(recentP1Fx));
      expect(r.state.isRefreshing, isFalse);
      expect(r.toastTexts, [Copy.displayError]);
    });

    fakeTest('TC-DISP-010 보이는 사진이 있을 때 연결 실패는 오류 화면이 아니라 토스트다', (async) {
      final r = _rig();
      _load(async, r);
      r.repo.onPosts(today, DisplaySort.recent, 1, [
        Reply.fail(networkError()),
      ]);
      r.vm.onReturnedFromFeed();
      settle(async);
      expect(r.state.status, DisplayStatus.content);
      expect(r.toastTexts, [Copy.commonErrorNetwork]);
    });
  });
}
