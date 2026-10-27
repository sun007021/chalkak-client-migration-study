import { FixtureRouter } from '../../data/__testing__/FixtureRouter';
import { BannerRepository } from '../../data/banner/BannerRepository';
import { createNetHarness } from '../../core/http/__testing__/createNetHarness';
import { deferred, networkFailure } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { BannerFeedViewModel, type BannerFeedState } from './BannerFeedViewModel';

const P1 = 'GET /banners?page=1&pageSize=10';
const P2 = 'GET /banners?page=2&pageSize=10';
const flush = async () => {
  for (let i = 0; i < 60; i += 1) await Promise.resolve();
};

function setup(table: ConstructorParameters<typeof FixtureRouter>[0] = {}) {
  const net = createNetHarness();
  const router = new FixtureRouter({
    [P1]: 'banner/banners__page1-10',
    [P2]: 'banner/banners__page2-last',
    ...table,
  }).install(net.transport);
  const viewModel = new BannerFeedViewModel({ repository: new BannerRepository({ api: net.api }) });
  return { ...net, router, viewModel };
}

const ready = (s: Readonly<BannerFeedState>) => {
  if (s.status !== 'ready') throw new Error(`ready가 아님: ${s.status}`);
  return s;
};
const ids = (s: Readonly<BannerFeedState>) => ready(s).banners.map((b) => b.id.slice(-2));

describe('BannerFeedViewModel 첫 페이지', () => {
  it('초기 상태는 loading이다', () => {
    expect(setup().viewModel.getSnapshot()).toEqual({ status: 'loading' });
  });

  it('TC-BANR-009 1페이지를 불러와 ready로 만든다(게스트·회원 공통, 토큰 없음)', async () => {
    const h = setup();
    await h.viewModel.load();
    const state = ready(h.viewModel.getSnapshot());
    expect(state.banners).toHaveLength(10);
    expect(state).toMatchObject({ hasNext: true, loadingMore: false });
    expect(h.router.calls(P1)[0].headers.Authorization).toBeUndefined();
  });

  it('TC-BANR-010 REQ-BANR-005 빈 성공이면 ready + 빈 목록(섹션 숨김)', async () => {
    const h = setup({ [P1]: 'banner/banners__empty' });
    await h.viewModel.load();
    expect(ready(h.viewModel.getSnapshot()).banners).toEqual([]);
  });

  it('TC-BANR-010 REQ-BANR-006 최초 조회 실패는 error 상태', async () => {
    const h = setup({ [P1]: 'banner/banners__500-server-error' });
    await h.viewModel.load();
    expect(h.viewModel.getSnapshot()).toEqual({ status: 'error' });
  });

  it('TC-BANR-006 webViewUrl이 안전하지 않은 응답은 잘못된 응답이라 error 상태', async () => {
    const h = setup({ [P1]: 'banner/banners__insecure-url' });
    await h.viewModel.load();
    expect(h.viewModel.getSnapshot()).toEqual({ status: 'error' });
  });

  it('REQ-BANR-006 error에서 load를 다시 부르면 loading을 거쳐 ready가 된다', async () => {
    const h = setup({ [P1]: 'banner/banners__500-server-error' });
    await h.viewModel.load();
    expect(h.viewModel.getSnapshot().status).toBe('error');
    h.router.set(P1, 'banner/banners__page1-10');
    await h.viewModel.load();
    expect(h.viewModel.getSnapshot().status).toBe('ready');
  });

  it('TC-BANR-007 잘못된 thumbnailUrl 배너도 목록에 남는다', async () => {
    const h = setup({ [P1]: 'banner/banners__bad-thumbnail' });
    await h.viewModel.load();
    expect(ids(h.viewModel.getSnapshot())).toEqual(['01', '02', '03']);
  });
});

describe('BannerFeedViewModel 페이징', () => {
  it('TC-BANR-012 마지막에서 두 번째 이내에 닿으면 page=2를 1회 요청해 10개씩 누적한다', async () => {
    const h = setup();
    await h.viewModel.load();

    await h.viewModel.onLastVisibleIndexChanged(6);
    expect(h.router.calls(P2)).toHaveLength(0);

    await h.viewModel.onLastVisibleIndexChanged(9);
    expect(h.router.calls(P2)).toHaveLength(1);
    const state = ready(h.viewModel.getSnapshot());
    expect(state.banners).toHaveLength(13);
    expect(state.hasNext).toBe(false);
  });

  it('TC-BANR-012 마지막에서 두 번째 항목(index 8)에서도 요청한다', async () => {
    const h = setup();
    await h.viewModel.load();
    await h.viewModel.onLastVisibleIndexChanged(8);
    expect(h.router.calls(P2)).toHaveLength(1);
  });

  it('TC-BANR-012 로딩 중에는 중복 요청하지 않고 loadingMore가 켜진다', async () => {
    const gate = deferred<void>();
    const h = setup({
      [P2]: async () => {
        await gate.promise;
        return fixtureResponse('banner/banners__page2-last');
      },
    });
    await h.viewModel.load();

    const first = h.viewModel.onLastVisibleIndexChanged(9);
    await flush();
    expect(ready(h.viewModel.getSnapshot()).loadingMore).toBe(true);
    void h.viewModel.onLastVisibleIndexChanged(9);
    void h.viewModel.onLastVisibleIndexChanged(8);
    await flush();
    expect(h.router.calls(P2)).toHaveLength(1);

    gate.resolve();
    await first;
    expect(ready(h.viewModel.getSnapshot()).loadingMore).toBe(false);
  });

  it('TC-BANR-013 REQ-BANR-009 추가 페이지 실패는 목록을 유지하고 다시 끝에 닿으면 같은 page=2를 재요청한다', async () => {
    const h = setup({ [P2]: 'banner/banners__500-server-error' });
    await h.viewModel.load();

    await h.viewModel.onLastVisibleIndexChanged(9);
    const afterFail = ready(h.viewModel.getSnapshot());
    expect(afterFail.banners).toHaveLength(10);
    expect(afterFail).toMatchObject({ hasNext: true, loadingMore: false });

    h.router.set(P2, 'banner/banners__page2-last');
    await h.viewModel.onLastVisibleIndexChanged(9);
    expect(ready(h.viewModel.getSnapshot()).banners).toHaveLength(13);
    expect(h.router.calls(P2)).toHaveLength(1); // 같은 page=2로 재요청
  });

  it('REQ-BANR-009 같은 id의 배너는 한 번만 보여 준다', async () => {
    const h = setup({ [P2]: 'banner/banners__page1-10' }); // page2가 page1과 같은 10개를 돌려줌
    await h.viewModel.load();
    await h.viewModel.onLastVisibleIndexChanged(9);
    expect(ready(h.viewModel.getSnapshot()).banners).toHaveLength(10);
  });

  it('TC-BANR-014 hasNext=false이면 끝에 닿아도 더 요청하지 않는다', async () => {
    const h = setup({ [P1]: 'banner/banners__page2-last' });
    await h.viewModel.load();
    await h.viewModel.onLastVisibleIndexChanged(2);
    expect(h.router.calls(P2)).toHaveLength(0);
  });

  it('TC-BANR-004 hasNext 필드가 없으면 마지막 페이지로 보고 추가 요청을 하지 않는다', async () => {
    const h = setup({ [P1]: 'banner/banners__no-has-next' });
    await h.viewModel.load();
    await h.viewModel.onLastVisibleIndexChanged(2);
    expect(h.router.calls(P2)).toHaveLength(0);
  });

  it('TC-BANR-014 빈 추가 페이지는 목록을 유지하고 조회를 종료한다', async () => {
    const h = setup({ [P2]: 'banner/banners__empty' });
    await h.viewModel.load();
    await h.viewModel.onLastVisibleIndexChanged(9);
    expect(ready(h.viewModel.getSnapshot())).toMatchObject({ hasNext: false });
    expect(ready(h.viewModel.getSnapshot()).banners).toHaveLength(10);
    await h.viewModel.onLastVisibleIndexChanged(9);
    expect(h.router.calls(P2)).toHaveLength(1);
  });
});

describe('BannerFeedViewModel 새로고침', () => {
  it('TC-BANR-015 누적 목록을 새 1페이지로 교체하고 다음 요청은 page=2부터 다시 시작한다', async () => {
    const h = setup();
    await h.viewModel.load();
    await h.viewModel.onLastVisibleIndexChanged(9);
    expect(ready(h.viewModel.getSnapshot()).banners).toHaveLength(13);

    await expect(h.viewModel.refresh()).resolves.toBeNull();
    const state = ready(h.viewModel.getSnapshot());
    expect(state.banners).toHaveLength(10);
    expect(state.hasNext).toBe(true);

    await h.viewModel.onLastVisibleIndexChanged(9);
    expect(h.router.calls(P2)).toHaveLength(2);
  });

  it('TC-BANR-011 새로고침 실패는 기존 목록을 유지하고 실패(연결 실패 여부 포함)를 돌려준다', async () => {
    const h = setup();
    await h.viewModel.load();
    h.router.set(P1, 'banner/banners__500-server-error');
    await expect(h.viewModel.refresh()).resolves.toEqual({ network: false });
    expect(ready(h.viewModel.getSnapshot()).banners).toHaveLength(10);

    h.router.set(P1, networkFailure());
    await expect(h.viewModel.refresh()).resolves.toEqual({ network: true });
    expect(ready(h.viewModel.getSnapshot()).banners).toHaveLength(10);
  });

  it('TC-BANR-011 빈 성공 새로고침은 기존 배너를 지운다', async () => {
    const h = setup();
    await h.viewModel.load();
    h.router.set(P1, 'banner/banners__empty');
    await expect(h.viewModel.refresh()).resolves.toBeNull();
    expect(ready(h.viewModel.getSnapshot()).banners).toEqual([]);
  });

  it('TC-BANR-016 새로고침 이전에 보낸 추가 페이지의 늦은 응답은 새 목록을 덮지 않는다', async () => {
    const late = deferred<void>();
    const h = setup({
      [P2]: async () => {
        await late.promise;
        return fixtureResponse('banner/banners__page2-last');
      },
    });
    await h.viewModel.load();
    const more = h.viewModel.onLastVisibleIndexChanged(9);
    await flush();

    await h.viewModel.refresh();
    late.resolve();
    await more;

    const state = ready(h.viewModel.getSnapshot());
    expect(state.banners).toHaveLength(10);
    expect(state.loadingMore).toBe(false);
  });
});

describe('BannerFeedViewModel 취소·초기화', () => {
  it('TC-BANR-008 TC-BANR-016 cancelPending 뒤 도착한 응답은 상태를 바꾸지 않는다', async () => {
    const gate = deferred<void>();
    const h = setup({
      [P1]: async () => {
        await gate.promise;
        return fixtureResponse('banner/banners__page1-10');
      },
    });
    const loading = h.viewModel.load();
    await flush();
    h.viewModel.cancelPending();
    gate.resolve();
    await loading;
    expect(h.viewModel.getSnapshot()).toEqual({ status: 'loading' });
  });

  it('TC-BANR-008 취소된 새로고침은 실패로 돌려주지 않는다(null)', async () => {
    const h = setup();
    await h.viewModel.load();
    const gate = deferred<void>();
    h.router.set(P1, async () => {
      await gate.promise;
      return fixtureResponse('banner/banners__page1-10');
    });
    const refreshing = h.viewModel.refresh();
    await flush();
    h.viewModel.cancelPending();
    gate.resolve();
    await expect(refreshing).resolves.toBeNull();
    expect(ready(h.viewModel.getSnapshot()).banners).toHaveLength(10);
  });

  it('TC-HOME-044 reset은 loading으로 되돌린다', async () => {
    const h = setup();
    await h.viewModel.load();
    h.viewModel.reset();
    expect(h.viewModel.getSnapshot()).toEqual({ status: 'loading' });
  });
});
