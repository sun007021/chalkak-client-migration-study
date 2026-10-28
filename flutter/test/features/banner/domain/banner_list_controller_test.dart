import 'package:chalkak/features/banner/domain/banner_list_controller.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/home_fakes.dart';
import '../../../support/net_harness.dart';

void main() {
  const retryWait = Duration(seconds: 3);

  (HomeRig, BannerListController) rig(FakeAsync async) {
    final r = HomeRig();
    return (r, r.banners);
  }

  void load(FakeAsync async, BannerListController c) {
    c.loadFirst();
    advance(async, retryWait);
  }

  fakeTest('TC-BANR-009 최초 조회 성공: 10개 ready, 다음 페이지가 있다', (async) {
    final (r, c) = rig(async);
    c.loadFirst();
    settle(async);
    expect(c.state.status, BannerListStatus.ready);
    expect(c.state.items, hasLength(10));
    expect(c.state.hasNext, isTrue);
    expect(r.api.bannerPagesRequested, ['1']);
  });

  fakeTest('TC-BANR-010 최초 조회가 실패하면 error 상태(섹션 숨김)이고 빈 성공은 empty(섹션 숨김)다', (
    async,
  ) {
    final (r, c) = rig(async);
    r.api.banners(1, [fx('banner/banners__500-server-error.json')]);
    load(async, c);
    expect(c.state.status, BannerListStatus.error);
    expect(c.state.items, isEmpty);

    final (r2, c2) = rig(async);
    r2.api.banners(1, [fx('banner/banners__empty.json')]);
    load(async, c2);
    expect(c2.state.status, BannerListStatus.empty);
  });

  fakeTest('TC-BANR-010 오류 뒤 retry로 다시 불러온다', (async) {
    final (r, c) = rig(async);
    r.api.banners(1, [
      ...failing('banner/banners__500-server-error.json'),
      fx('banner/banners__page1-10.json'),
    ]);
    load(async, c);
    expect(c.state.status, BannerListStatus.error);
    c.retry();
    advance(async, retryWait);
    expect(c.state.status, BannerListStatus.ready);
  });

  fakeTest('TC-BANR-004 hasNext가 없으면 끝까지 보여도 추가 요청이 없다', (async) {
    final (r, c) = rig(async);
    r.api.banners(1, [fx('banner/banners__no-has-next.json')]);
    load(async, c);
    c.onItemVisible(2);
    c.onItemVisible(1);
    settle(async);
    expect(r.api.bannerPagesRequested, ['1']);
  });

  fakeTest('TC-BANR-012 마지막에서 두 번째 이내에 닿으면 page=2를 1회만 요청해 10개씩 누적한다', (async) {
    final (r, c) = rig(async);
    load(async, c);
    c.onItemVisible(7);
    settle(async);
    expect(r.api.bannerPagesRequested, ['1'], reason: '끝에서 세 번째 이전');

    r.api.banners(2, [
      fx('banner/banners__page2-last.json', delay: const Duration(seconds: 1)),
    ]);
    c.onItemVisible(8);
    c.onItemVisible(9);
    c.onItemVisible(9);
    settle(async);
    expect(c.state.isLoadingMore, isTrue);
    expect(r.api.bannerPagesRequested, ['1', '2'], reason: '로딩 중 중복 요청 없음');

    advance(async, const Duration(seconds: 1));
    expect(c.state.isLoadingMore, isFalse);
    expect(c.state.items, hasLength(13));
    expect(c.state.hasNext, isFalse);
    expect(c.state.items.last.id.endsWith('13'), isTrue);
  });

  fakeTest('TC-BANR-013 추가 페이지가 실패하면 목록을 유지하고 같은 페이지를 다시 요청하며 중복 ID는 한 번만 둔다', (
    async,
  ) {
    final (r, c) = rig(async);
    load(async, c);
    r.api.banners(2, [
      ...failing('banner/banners__500-server-error.json'),
      FakeResponse.json(200, {
        'currentPage': 2,
        'pageSize': 10,
        'hasNext': false,
        'banners': [
          // page 1의 마지막 배너와 같은 id
          {
            'id': '44444444-4444-4444-8444-444444444410',
            'title': '중복',
            'subtitle': '중복',
            'webViewUrl': 'https://web.example.test/issues/10',
            'thumbnailUrl': 'https://cdn.example.test/banners/10.webp',
            'createdAt': '2026-10-18T01:00:00Z',
          },
          {
            'id': '44444444-4444-4444-8444-444444444411',
            'title': '새 배너',
            'subtitle': '새 배너',
            'webViewUrl': 'https://web.example.test/issues/11',
            'thumbnailUrl': 'https://cdn.example.test/banners/11.webp',
            'createdAt': '2026-10-17T01:00:00Z',
          },
        ],
      }),
    ]);
    c.onItemVisible(9);
    advance(async, retryWait);
    expect(c.state.items, hasLength(10), reason: '실패해도 쌓인 목록 유지');
    expect(c.state.isLoadingMore, isFalse);
    expect(c.state.status, BannerListStatus.ready);

    final before = r.api.bannerPagesRequested.length;
    c.onItemVisible(9);
    advance(async, retryWait);
    expect(r.api.bannerPagesRequested.sublist(before), [
      '2',
    ], reason: '같은 페이지 번호');
    expect(c.state.items, hasLength(11), reason: '중복 id 제거');
  });

  fakeTest('TC-BANR-014 hasNext=false 또는 빈 추가 페이지 뒤에는 더 요청하지 않고 목록을 유지한다', (
    async,
  ) {
    final (r, c) = rig(async);
    load(async, c);
    r.api.banners(2, [fx('banner/banners__empty.json')]);
    c.onItemVisible(9);
    settle(async);
    expect(c.state.items, hasLength(10));
    final calls = r.api.bannerCalls;
    c.onItemVisible(9);
    c.onItemVisible(8);
    settle(async);
    expect(r.api.bannerCalls, calls);
    expect(c.state.hasNext, isFalse);

    final (r2, c2) = rig(async);
    load(async, c2);
    c2.onItemVisible(9);
    settle(async);
    expect(c2.state.items, hasLength(13));
    final calls2 = r2.api.bannerCalls;
    c2.onItemVisible(12);
    settle(async);
    expect(r2.api.bannerCalls, calls2, reason: 'hasNext=false');
  });

  fakeTest('TC-BANR-015 새로고침은 누적 목록을 새 1페이지로 교체하고 다음 요청은 page=2부터 다시 시작한다', (
    async,
  ) {
    final (r, c) = rig(async);
    load(async, c);
    c.onItemVisible(9);
    settle(async);
    expect(c.state.items, hasLength(13));
    r.api.banners(1, [fx('banner/banners__page1-10.json')]);
    r.api.banners(2, [fx('banner/banners__page2-last.json')]);
    final result = start(async, c.refresh());
    settle(async);
    expect(result.value, isNull);
    expect(c.state.items, hasLength(10));
    expect(c.state.hasNext, isTrue);
    final before = r.api.bannerPagesRequested.length;
    c.onItemVisible(9);
    settle(async);
    expect(r.api.bannerPagesRequested.sublist(before), ['2']);
  });

  fakeTest('TC-BANR-011 새로고침이 실패하면 기존 배너를 유지하고 오류를 돌려주며, 빈 성공이면 비운다', (async) {
    final (r, c) = rig(async);
    load(async, c);
    r.api.banners(1, [fx('banner/banners__500-server-error.json')]);
    var result = start(async, c.refresh());
    advance(async, retryWait);
    expect(result.value, isNotNull, reason: '실패 오류 반환');
    expect(c.state.items, hasLength(10));
    expect(c.state.status, BannerListStatus.ready);

    r.api.banners(1, [fx('banner/banners__empty.json')]);
    result = start(async, c.refresh());
    advance(async, retryWait);
    expect(result.value, isNull);
    expect(c.state.items, isEmpty);
    expect(c.state.status, BannerListStatus.empty);
  });

  fakeTest('TC-BANR-016 추가 페이지 요청 중 새로고침하면 늦게 온 이전 응답은 버린다', (async) {
    final (r, c) = rig(async);
    load(async, c);
    r.api.banners(2, [
      fx('banner/banners__page2-last.json', delay: const Duration(seconds: 5)),
    ]);
    c.onItemVisible(9);
    settle(async);
    expect(c.state.isLoadingMore, isTrue);

    r.api.banners(1, [fx('banner/banners__page1-10.json')]);
    c.refresh();
    advance(async, const Duration(seconds: 1));
    expect(c.state.items, hasLength(10));
    advance(async, const Duration(seconds: 6));
    expect(c.state.items, hasLength(10), reason: '늦은 page 2 응답이 덮지 않는다');
    expect(c.state.isLoadingMore, isFalse);
  });

  fakeTest('TC-BANR-008 TC-BANR-016 화면 이탈(취소·dispose)은 오류가 아니고 상태를 바꾸지 않는다', (
    async,
  ) {
    final (r, c) = rig(async);
    load(async, c);
    r.api.banners(2, [
      fx('banner/banners__page2-last.json', delay: const Duration(seconds: 5)),
    ]);
    c.onItemVisible(9);
    settle(async);
    final status = c.state.status;
    c.cancelPending();
    c.dispose();
    advance(async, const Duration(seconds: 6));
    expect(c.state.status, status);
    expect(c.state.items, hasLength(10));
  });

  fakeTest('TC-BANR-008 최초 조회 중 취소하면 error로 바뀌지 않는다', (async) {
    final (r, c) = rig(async);
    r.api.banners(1, [
      fx('banner/banners__page1-10.json', delay: const Duration(seconds: 5)),
    ]);
    c.loadFirst();
    settle(async);
    c.cancelPending();
    advance(async, const Duration(seconds: 6));
    expect(c.state.status, isNot(BannerListStatus.error));
  });
}
