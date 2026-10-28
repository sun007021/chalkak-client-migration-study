import { makeApiEnv } from '../../test/apiEnv';
import { deferred } from '../../test/deferred';
import { settle } from '../../test/homeHarness';
import { FixtureRouter, json } from '../../test/fixtureRouter';
import { networkFailure } from '../../test/fakeFetch';
import { guestSession, loadFixture } from '../../test/fixtures';
import { BannerFeed } from './BannerFeed';
import type { BannerFeedState } from './BannerFeed';
import { BannerRepository } from './BannerRepository';

const P1 = 'GET /banners?page=1&pageSize=10';
const P2 = 'GET /banners?page=2&pageSize=10';

function setup(table: ConstructorParameters<typeof FixtureRouter>[1] = {}) {
  const env = makeApiEnv(guestSession);
  const router = new FixtureRouter(env.ff, { [P1]: 'banner/banners__page1-10', [P2]: 'banner/banners__page2-last', ...table });
  const feed = new BannerFeed({ repository: new BannerRepository({ api: env.client() }) });
  /** 5xx 재시도 백오프를 소화하며 끝까지 기다린다. */
  const finish = async <T>(promise: Promise<T>): Promise<T> => {
    let done = false;
    const wrapped = promise.finally(() => {
      done = true;
    });
    for (let i = 0; !done; i += 1) {
      if (i > 20) throw new Error('약속이 끝나지 않았다');
      await env.clock.advance(1_000);
    }
    return wrapped;
  };
  return { ...env, router, feed, finish };
}

const ready = (s: BannerFeedState) => {
  if (s.status !== 'ready') throw new Error(`ready가 아님: ${s.status}`);
  return s;
};
const ids = (s: BannerFeedState) => ready(s).banners.map((b) => b.id.slice(-2));

describe('BannerFeed 첫 페이지', () => {
  it('초기 상태는 loading이다', () => {
    expect(setup().feed.state).toEqual({ status: 'loading' });
  });

  it('TC-BANR-009 REQ-BANR-001 1페이지를 불러와 ready로 만든다(토큰 없음)', async () => {
    const h = setup();
    await h.finish(h.feed.load());
    const state = ready(h.feed.state);
    expect(state.banners).toHaveLength(10);
    expect(state).toMatchObject({ hasNext: true, loadingMore: false, nextPage: 2 });
    expect(h.router.calls(P1)[0]!.headers['authorization']).toBeUndefined();
  });

  it('REQ-BANR-009 첫 페이지 응답 안에 같은 id가 두 번 오면 한 번만 보여 준다(새로고침도 같다)', async () => {
    const banner = (id: string) => ({
      id: `44444444-4444-4444-8444-4444444444${id}`,
      title: `이슈 ${id}`,
      subtitle: '부제',
      webViewUrl: 'https://web.example.test/issues/1',
      thumbnailUrl: null,
      createdAt: '2026-10-27T01:00:00Z',
    });
    const page = () => json(200, { currentPage: 1, pageSize: 10, hasNext: false, banners: [banner('01'), banner('02'), banner('01')] });
    const h = setup({ [P1]: page });
    await h.finish(h.feed.load());
    expect(ids(h.feed.state)).toEqual(['01', '02']);
    await h.finish(h.feed.refresh());
    expect(ids(h.feed.state)).toEqual(['01', '02']);
  });

  it('TC-BANR-010 REQ-BANR-005 빈 성공이면 ready + 빈 목록(ISSUE 섹션 숨김)', async () => {
    const h = setup({ [P1]: 'banner/banners__empty' });
    await h.finish(h.feed.load());
    expect(ready(h.feed.state).banners).toEqual([]);
  });

  it('TC-BANR-010 REQ-BANR-006 최초 조회 실패는 error 상태(home.issue-error)', async () => {
    const h = setup({ [P1]: 'banner/banners__500-server-error' });
    await h.finish(h.feed.load());
    expect(h.feed.state).toEqual({ status: 'error' });
  });

  it('TC-BANR-006 webViewUrl이 안전하지 않은 응답은 잘못된 응답이라 error 상태', async () => {
    const h = setup({ [P1]: 'banner/banners__insecure-url' });
    await h.finish(h.feed.load());
    expect(h.feed.state).toEqual({ status: 'error' });
  });

  it('REQ-BANR-006 error에서 load를 다시 부르면 loading을 거쳐 ready가 된다', async () => {
    const h = setup({ [P1]: 'banner/banners__500-server-error' });
    await h.finish(h.feed.load());
    expect(h.feed.state.status).toBe('error');
    h.router.set(P1, 'banner/banners__page1-10');
    const seen: string[] = [];
    h.feed.subscribe(() => seen.push(h.feed.state.status));
    await h.finish(h.feed.load());
    expect(seen).toContain('loading');
    expect(h.feed.state.status).toBe('ready');
  });

  it('TC-BANR-007 잘못된 thumbnailUrl 배너도 목록에 남는다', async () => {
    const h = setup({ [P1]: 'banner/banners__bad-thumbnail' });
    await h.finish(h.feed.load());
    expect(ids(h.feed.state)).toEqual(['01', '02', '03']);
  });
});

describe('BannerFeed 페이징 (REQ-BANR-007~009)', () => {
  it('TC-BANR-012 마지막에서 두 번째 이내에 닿으면 page=2를 1회 요청해 10개씩 누적한다', async () => {
    const h = setup();
    await h.finish(h.feed.load());

    await h.feed.onLastVisibleIndexChanged(6);
    expect(h.router.calls(P2)).toHaveLength(0);

    await h.feed.onLastVisibleIndexChanged(9);
    expect(h.router.calls(P2)).toHaveLength(1);
    const state = ready(h.feed.state);
    expect(state.banners).toHaveLength(13);
    expect(state.hasNext).toBe(false);
  });

  it('TC-BANR-012 마지막에서 두 번째 항목(index 8)에서도 요청한다', async () => {
    const h = setup();
    await h.finish(h.feed.load());
    await h.feed.onLastVisibleIndexChanged(8);
    expect(h.router.calls(P2)).toHaveLength(1);
  });

  it('TC-BANR-012 로딩 중에는 중복 요청하지 않고 loadingMore가 켜진다', async () => {
    const gate = deferred<void>();
    const h = setup({
      [P2]: async () => {
        await gate.promise;
        return loadFixture('banner/banners__page2-last.json').toResponse();
      },
    });
    await h.finish(h.feed.load());

    const first = h.feed.onLastVisibleIndexChanged(9);
    await settle();
    expect(ready(h.feed.state).loadingMore).toBe(true);
    void h.feed.onLastVisibleIndexChanged(9);
    void h.feed.onLastVisibleIndexChanged(8);
    await settle();
    expect(h.router.calls(P2)).toHaveLength(1);

    gate.resolve();
    await first;
    expect(ready(h.feed.state).loadingMore).toBe(false);
  });

  it('TC-BANR-013 REQ-BANR-009 추가 페이지 실패는 목록을 유지하고 다시 끝에 닿으면 같은 page=2를 재요청한다', async () => {
    const h = setup({ [P2]: 'banner/banners__500-server-error' });
    await h.finish(h.feed.load());

    await h.finish(h.feed.onLastVisibleIndexChanged(9));
    const afterFail = ready(h.feed.state);
    expect(afterFail.banners).toHaveLength(10);
    expect(afterFail).toMatchObject({ hasNext: true, loadingMore: false, nextPage: 2 });

    h.router.set(P2, 'banner/banners__page2-last');
    await h.feed.onLastVisibleIndexChanged(9);
    expect(ready(h.feed.state).banners).toHaveLength(13);
    expect(h.router.calls(P2)).toHaveLength(1); // 같은 page=2로 재요청
  });

  it('TC-BANR-013 REQ-BANR-009 같은 id의 배너는 한 번만 보여 준다', async () => {
    const h = setup({ [P2]: 'banner/banners__page1-10' }); // page2가 page1과 같은 10개를 돌려줌
    await h.finish(h.feed.load());
    await h.feed.onLastVisibleIndexChanged(9);
    expect(ready(h.feed.state).banners).toHaveLength(10);
  });

  it('TC-BANR-014 REQ-BANR-008 hasNext=false이면 끝에 닿아도 더 요청하지 않는다', async () => {
    const h = setup({ [P1]: 'banner/banners__page2-last' });
    await h.finish(h.feed.load());
    await h.feed.onLastVisibleIndexChanged(2);
    expect(h.router.calls(P2)).toHaveLength(0);
  });

  it('TC-BANR-004 hasNext 필드가 없으면 마지막 페이지로 보고 추가 요청을 하지 않는다', async () => {
    const h = setup({ [P1]: 'banner/banners__no-has-next' });
    await h.finish(h.feed.load());
    await h.feed.onLastVisibleIndexChanged(2);
    expect(h.router.calls(P2)).toHaveLength(0);
  });

  it('TC-BANR-014 빈 추가 페이지는 목록을 유지하고 조회를 종료한다', async () => {
    const h = setup({ [P2]: 'banner/banners__empty' });
    await h.finish(h.feed.load());
    await h.feed.onLastVisibleIndexChanged(9);
    expect(ready(h.feed.state)).toMatchObject({ hasNext: false });
    expect(ready(h.feed.state).banners).toHaveLength(10);
    await h.feed.onLastVisibleIndexChanged(9);
    expect(h.router.calls(P2)).toHaveLength(1);
  });

  it('첫 페이지가 로딩 중이거나 error이면 onLastVisibleIndexChanged는 아무것도 요청하지 않는다', async () => {
    const h = setup({ [P1]: 'banner/banners__500-server-error' });
    await h.feed.onLastVisibleIndexChanged(9);
    expect(h.ff.calls).toHaveLength(0);
    await h.finish(h.feed.load());
    await h.feed.onLastVisibleIndexChanged(9);
    expect(h.router.calls(P2)).toHaveLength(0);
  });
});

describe('BannerFeed 새로고침 (REQ-BANR-010, 011)', () => {
  it('TC-BANR-015 누적 목록을 새 1페이지로 교체하고 다음 요청은 page=2부터 다시 시작한다', async () => {
    const h = setup();
    await h.finish(h.feed.load());
    await h.feed.onLastVisibleIndexChanged(9);
    expect(ready(h.feed.state).banners).toHaveLength(13);

    await expect(h.finish(h.feed.refresh())).resolves.toBeNull();
    const state = ready(h.feed.state);
    expect(state.banners).toHaveLength(10);
    expect(state).toMatchObject({ hasNext: true, nextPage: 2 });

    await h.feed.onLastVisibleIndexChanged(9);
    expect(h.router.calls(P2)).toHaveLength(2);
  });

  it('TC-BANR-011 새로고침 실패는 기존 목록을 유지하고 실패 종류(연결 실패 여부)를 돌려준다', async () => {
    const h = setup();
    await h.finish(h.feed.load());
    h.router.set(P1, 'banner/banners__500-server-error');
    await expect(h.finish(h.feed.refresh())).resolves.toEqual({ network: false });
    expect(ready(h.feed.state).banners).toHaveLength(10);

    h.router.set(P1, networkFailure);
    await expect(h.finish(h.feed.refresh())).resolves.toEqual({ network: true });
    expect(ready(h.feed.state).banners).toHaveLength(10);
  });

  it('TC-BANR-011 빈 성공 새로고침은 기존 배너를 지운다', async () => {
    const h = setup();
    await h.finish(h.feed.load());
    h.router.set(P1, 'banner/banners__empty');
    await expect(h.finish(h.feed.refresh())).resolves.toBeNull();
    expect(ready(h.feed.state).banners).toEqual([]);
  });

  it('TC-BANR-016 REQ-BANR-010 새로고침 이전에 보낸 추가 페이지의 늦은 응답은 새 목록을 덮지 않는다', async () => {
    const late = deferred<void>();
    const h = setup({
      [P2]: async () => {
        await late.promise;
        return loadFixture('banner/banners__page2-last.json').toResponse();
      },
    });
    await h.finish(h.feed.load());
    const more = h.feed.onLastVisibleIndexChanged(9);
    await settle();

    await h.finish(h.feed.refresh());
    late.resolve();
    await more;

    const state = ready(h.feed.state);
    expect(state.banners).toHaveLength(10);
    expect(state.loadingMore).toBe(false);
  });
});

describe('BannerFeed 취소·초기화', () => {
  it('TC-BANR-008 TC-BANR-016 cancelPending 뒤 도착한 응답은 상태를 바꾸지 않는다', async () => {
    const gate = deferred<void>();
    const h = setup({
      [P1]: async () => {
        await gate.promise;
        return loadFixture('banner/banners__page1-10.json').toResponse();
      },
    });
    const loading = h.feed.load();
    await settle();
    h.feed.cancelPending();
    gate.resolve();
    await loading;
    expect(h.feed.state).toEqual({ status: 'loading' });
  });

  it('TC-BANR-008 취소된 새로고침은 실패로 돌려주지 않는다(null)이고 기존 목록이 유지된다', async () => {
    const h = setup();
    await h.finish(h.feed.load());
    const gate = deferred<void>();
    h.router.set(P1, async () => {
      await gate.promise;
      return loadFixture('banner/banners__page1-10.json').toResponse();
    });
    const refreshing = h.feed.refresh();
    await settle();
    h.feed.cancelPending();
    gate.resolve();
    await expect(refreshing).resolves.toBeNull();
    expect(ready(h.feed.state).banners).toHaveLength(10);
  });

  it('TC-HOME-044 reset은 loading으로 되돌린다', async () => {
    const h = setup();
    await h.finish(h.feed.load());
    h.feed.reset();
    expect(h.feed.state).toEqual({ status: 'loading' });
  });
});

describe('BannerFeed 추가 페이지와 1페이지 요청의 관계 (REQ-BANR-010)', () => {
  it('TC-BANR-016 새로고침이 진행 중이면 센티넬이 보여도 추가 페이지 요청을 시작하지 않는다', async () => {
    const h = setup();
    await h.finish(h.feed.load());
    const gate = deferred<void>();
    h.router.set(P1, async () => {
      await gate.promise;
      return loadFixture('banner/banners__page1-10.json').toResponse();
    });
    const refreshing = h.feed.refresh();
    await settle();
    await h.feed.onSentinelVisible();
    expect(h.router.calls(P2)).toHaveLength(0);
    gate.resolve();
    await h.finish(refreshing);
    expect(ready(h.feed.state).banners).toHaveLength(10);
  });

  it('TC-BANR-016 추가 페이지 요청 중 새로고침이 이기면 늦은 추가 응답은 버려지고 새로고침 결과가 남는다', async () => {
    const late = deferred<void>();
    const h = setup({
      [P2]: async () => {
        await late.promise;
        return loadFixture('banner/banners__page2-last.json').toResponse();
      },
    });
    await h.finish(h.feed.load());
    const more = h.feed.onSentinelVisible();
    await settle();
    expect(ready(h.feed.state).loadingMore).toBe(true);
    await h.finish(h.feed.refresh());
    late.resolve();
    await more;
    expect(ready(h.feed.state)).toMatchObject({ loadingMore: false, nextPage: 2, hasNext: true });
    expect(ready(h.feed.state).banners).toHaveLength(10);
  });

  it('TC-BANR-012 추가 페이지 요청은 진행 중인 1페이지 요청을 취소하지 않는다(상태가 ready가 아니면 시작도 하지 않는다)', async () => {
    const gate = deferred<void>();
    const h = setup({
      [P1]: async () => {
        await gate.promise;
        return loadFixture('banner/banners__page1-10.json').toResponse();
      },
    });
    const loading = h.feed.load();
    await settle();
    await h.feed.onSentinelVisible();
    gate.resolve();
    await h.finish(loading);
    expect(ready(h.feed.state).banners).toHaveLength(10);
    expect(h.router.calls(P2)).toHaveLength(0);
  });

  it('TC-BANR-013 추가 페이지가 실패하면 센티넬로는 다시 요청하지 않고 retryMore가 같은 page=2를 요청한다', async () => {
    const h = setup({ [P2]: 'banner/banners__500-server-error' });
    await h.finish(h.feed.load());
    await h.finish(h.feed.onSentinelVisible());
    expect(ready(h.feed.state)).toMatchObject({ moreFailed: true, loadingMore: false, nextPage: 2 });
    const calls = h.router.calls(P2).length;
    await h.feed.onSentinelVisible();
    expect(h.router.calls(P2)).toHaveLength(calls);

    h.router.set(P2, 'banner/banners__page2-last');
    await h.feed.retryMore();
    expect(ready(h.feed.state)).toMatchObject({ moreFailed: false, hasNext: false });
    expect(ready(h.feed.state).banners).toHaveLength(13);
    expect(h.router.calls(P2)).toHaveLength(1);
  });
});
