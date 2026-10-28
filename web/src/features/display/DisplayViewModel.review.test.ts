import { deferred } from '../../test/deferred';
import { gated, openToday, ready } from '../../test/displayAsserts';
import { finish, settle } from '../../test/homeHarness';
import { createPostHarness } from '../../test/postHarness';
import { TODAY, dateRoutes, postsKey, topicKey } from '../../test/postRoutes';

describe('DisplayViewModel 코드리뷰 회귀', () => {
  it('코드리뷰 8 같은 (날짜, 정렬)의 읽기가 진행 중이면 다른 키를 거쳐 돌아와도 요청을 다시 보내지 않는다', async () => {
    const gate = deferred<void>();
    const h = createPostHarness({ routes: { [postsKey(TODAY, 'popular')]: gated(gate, 'display/posts-list__popular-page1') } });
    const vm = h.display();
    await openToday(h, vm);
    const topicBefore = h.router.calls(topicKey(TODAY)).length;
    void vm.selectSort('popular');
    await settle();
    expect(h.router.calls(postsKey(TODAY, 'popular'))).toHaveLength(1);
    void vm.selectSort('recent'); // 캐시된 최신순으로 돌아가 조용히 재검증
    await settle();
    void vm.selectSort('popular'); // 인기순 첫 읽기는 아직 끝나지 않았다
    await settle();
    expect(h.router.calls(postsKey(TODAY, 'popular'))).toHaveLength(1);
    expect(h.router.calls(topicKey(TODAY)).length - topicBefore).toBe(1);
    gate.resolve();
    await finish(h, vm.selectSort('popular'));
    expect(vm.state).toMatchObject({ sort: 'popular', body: { status: 'ready' } });
    expect(h.router.calls(postsKey(TODAY, 'popular'))).toHaveLength(1);
  });

  it('코드리뷰 8 진행 중인 같은 키 이동은 같은 약속을 돌려준다(요청 1건)', async () => {
    const gate = deferred<void>();
    const h = createPostHarness({ routes: { [postsKey(TODAY, 'recent')]: gated(gate, 'display/posts-list__recent-page1') } });
    const vm = h.display();
    const first = vm.applyRoute({ date: null, sort: null });
    const second = vm.applyRoute({ date: TODAY, sort: 'recent' });
    await settle();
    gate.resolve();
    await finish(h, Promise.all([first, second]));
    expect(h.router.calls(postsKey(TODAY, 'recent'))).toHaveLength(1);
  });

  it('코드리뷰 13 TC-DISP-015 보이는 채로 자정을 넘기면 today와 다음 날짜 이동이 갱신된다', async () => {
    const h = createPostHarness({
      now: '2026-10-27T14:59:59.000Z',
      routes: { ...dateRoutes('2026-10-28', 'recent', 'display/posts-list__recent-page1') },
    });
    const vm = h.display();
    await openToday(h, vm);
    await finish(h, vm.onShown()); // 화면이 붙으면 자정 감시가 시작된다
    expect(vm.state).toMatchObject({ today: TODAY, canGoNext: false });
    await h.clock.advance(1000);
    await settle();
    expect(vm.state.today).toBe('2026-10-28');
    expect(vm.state.canGoNext).toBe(true);
    expect(vm.state.date).toBe(TODAY);
    expect(ready(vm).posts.length).toBeGreaterThan(0);
  });

  it('코드리뷰 13 화면이 숨겨진 동안에는 자정 감시가 멈춰 today를 바꾸지 않는다(복귀 때 onShown이 맞춘다)', async () => {
    const h = createPostHarness({ now: '2026-10-27T14:59:59.000Z' });
    const vm = h.display();
    await openToday(h, vm);
    await finish(h, vm.onShown());
    vm.onHidden();
    await h.clock.advance(1000);
    await settle();
    expect(vm.state.today).toBe(TODAY);
  });
});
