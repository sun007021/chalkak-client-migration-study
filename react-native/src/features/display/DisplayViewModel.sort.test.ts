import { d } from '../../core/time/__testing__/helpers';
import { t } from '../../shared/copy';
import { flush } from '../home/__testing__/createHomeHarness';
import {
  createDisplayHarness,
  datedRoutes,
  gatedRoute,
  ID,
  q,
} from './__testing__/createDisplayHarness';

const RECENT = q('2026-10-27', 'recent', 1);
const POPULAR = q('2026-10-27', 'popular', 1);
const RANDOM1 = q('2026-10-27', 'random', 1);
const RANDOM2 = q('2026-10-27', 'random', 2, 'seed_abc123');
const idsOf = (h: Awaited<ReturnType<typeof createDisplayHarness>>) =>
  h.viewModel.getSnapshot().photos.map((p) => p.id);
const seedOf = (url: string) => new URL(url).searchParams.get('randomSeed');

describe('DisplayViewModel 정렬', () => {
  it('TC-DISP-011 기본은 최신순이고 정렬을 고르면 sort가 recent·popular·random으로 요청된다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({ sort: 'recent', preferredSort: 'recent' });
    await h.viewModel.selectSort('popular');
    expect(h.viewModel.getSnapshot().sort).toBe('popular');
    await h.viewModel.selectSort('random');
    expect(h.viewModel.getSnapshot().sort).toBe('random');
    expect([h.callsOf(RECENT), h.callsOf(POPULAR), h.callsOf(RANDOM1)]).toEqual([1, 1, 1]);
  });

  it('TC-DISP-012 정렬을 바꾸면 응답이 올 때까지 기존 사진을 유지한 채 refreshing이고 도착하면 교체한다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    const recent = idsOf(h);
    const gate = gatedRoute(h.router, POPULAR, 'display/posts-list__popular-page1');
    const changing = h.viewModel.selectSort('popular');
    await flush();
    expect(h.viewModel.getSnapshot()).toMatchObject({ refreshing: true, status: 'content' });
    expect(idsOf(h)).toEqual(recent);
    gate.release();
    await changing;
    expect(h.viewModel.getSnapshot().refreshing).toBe(false);
    expect(idsOf(h)).not.toEqual(recent);
    expect(h.viewModel.getSnapshot().photos[0].id).toBe(ID('02'));
  });

  it('TC-DISP-012 [가정: REQ-DISP-020대로 캐시를 즉시 보여 준 뒤 재검증한다] 이미 본 (날짜, 정렬)은 캐시를 즉시 보여 준다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    const recent = idsOf(h);
    await h.viewModel.selectSort('popular');
    const popular = idsOf(h);
    const gate = gatedRoute(h.router, RECENT, 'display/posts-list__recent-page1');
    const back = h.viewModel.selectSort('recent');
    // 응답 전인데도 처음 본 최신순 캐시가 그대로(같은 ID 배열) 바로 보인다.
    expect(idsOf(h)).toEqual(recent);
    expect(idsOf(h)).not.toEqual(popular);
    expect(h.viewModel.getSnapshot()).toMatchObject({ sort: 'recent', refreshing: true });
    // gatedRoute가 라우트를 교체하면서 호출 기록이 새로 시작된다: 재검증 요청이 응답 전에 이미 1건 나갔다.
    await flush();
    expect(h.callsOf(RECENT)).toBe(1);
    gate.release();
    await back;
    expect(h.callsOf(RECENT)).toBe(1);
    expect(idsOf(h)).toEqual(recent);
  });

  it('TC-DISP-013 지난 날짜는 아카이브로 popular만 쓰고 상위 5개를 추천에 쓴다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    await h.viewModel.goPrevious();
    const s = h.viewModel.getSnapshot();
    expect(s).toMatchObject({ mode: 'archive', sort: 'popular' });
    expect(s.date.toString()).toBe('2026-10-26');
    expect(h.callsOf(q('2026-10-26', 'popular', 1))).toBe(1);
    expect(s.featured.map((p) => p.id)).toEqual(s.photos.slice(0, 5).map((p) => p.id));
    expect(s.featured).toHaveLength(5);
    expect(s.photos).toHaveLength(20);
  });

  it('TC-DISP-014 오늘에서 랜덤순을 보다가 과거 날짜로 갔다 돌아오면 직전 정렬(랜덤순)이 복원된다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    await h.viewModel.selectSort('random');
    await h.viewModel.goPrevious();
    expect(h.viewModel.getSnapshot()).toMatchObject({ sort: 'popular', preferredSort: 'random' });
    await h.viewModel.goNext();
    expect(h.viewModel.getSnapshot()).toMatchObject({ mode: 'latest', sort: 'random' });
  });

  it('TC-DISP-015 랜덤 첫 페이지는 randomSeed를 보내지 않고 응답 시드를 저장해 2페이지에 쓴다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    await h.viewModel.selectSort('random');
    expect(seedOf(h.router.calls(RANDOM1)[0].url)).toBeNull();
    await h.viewModel.onLastVisibleIndexChanged(19);
    expect(h.callsOf(RANDOM2)).toBe(1);
  });

  it('TC-DISP-016 랜덤 2페이지는 page=2&randomSeed=<저장값>으로 요청한다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    await h.viewModel.selectSort('random');
    await h.viewModel.onLastVisibleIndexChanged(19);
    const query = Object.fromEntries(new URL(h.router.calls(RANDOM2)[0].url).searchParams);
    expect(query).toMatchObject({ sort: 'random', page: '2', randomSeed: 'seed_abc123' });
    expect(h.viewModel.getSnapshot().photos).toHaveLength(27);
  });

  it('TC-DISP-017 랜덤 첫 페이지를 재검증해도 저장된 시드를 보내고 같은 시드의 뒤쪽 페이지는 유지한다', async () => {
    const h = await createDisplayHarness({
      routes: {
        [q('2026-10-27', 'random', 1, 'seed_abc123')]: 'display/posts-list__random-page1-seed',
      },
    });
    await h.viewModel.onShown();
    await h.viewModel.selectSort('random');
    await h.viewModel.onLastVisibleIndexChanged(19);
    await h.viewModel.onTabReselected();
    const revalidation = h.router.calls(q('2026-10-27', 'random', 1, 'seed_abc123'));
    expect(revalidation).toHaveLength(1);
    expect(seedOf(revalidation[0].url)).toBe('seed_abc123');
    expect(h.viewModel.getSnapshot().photos).toHaveLength(27);
  });

  it('TC-DISP-018 랜덤에서 최신·인기로 바꾸면 시드를 폐기해 이후 요청에 randomSeed가 없고 랜덤으로 돌아와도 새로 시작한다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    await h.viewModel.selectSort('random');
    await h.viewModel.selectSort('popular');
    await h.viewModel.selectSort('recent');
    expect(
      h.transport.requests
        .filter((r) => /sort=(popular|recent)/.test(r.url))
        .every((r) => seedOf(r.url) === null),
    ).toBe(true);
    h.router.set(RANDOM1, 'display/posts-list__random-page1-seed');
    await h.viewModel.selectSort('random');
    const last = h.router.calls(RANDOM1).at(-1)!;
    expect(seedOf(last.url)).toBeNull();
  });

  it('TC-DISP-019 랜덤 응답에 randomSeed가 없으면 2페이지 요청을 보내지 않고 연속 로딩을 멈춘다', async () => {
    const h = await createDisplayHarness({
      routes: { [RANDOM1]: 'display/posts-list__random-no-seed' },
    });
    await h.viewModel.onShown();
    await h.viewModel.selectSort('random');
    const before = h.transport.requests.length;
    await h.viewModel.onLastVisibleIndexChanged(19);
    expect(h.transport.requests).toHaveLength(before);
    expect(h.viewModel.getSnapshot().paging).toBe(false);
  });

  it('TC-DISP-020 랜덤 페이지 사이에 같은 사진 ID가 중복되면 경계에서 한 번만 보여 준다', async () => {
    const h = await createDisplayHarness({
      routes: { [RANDOM2]: 'display/posts-list__random-page2-overlap' },
    });
    await h.viewModel.onShown();
    await h.viewModel.selectSort('random');
    await h.viewModel.onLastVisibleIndexChanged(19);
    const ids = idsOf(h);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(25);
  });

  it('TC-DISP-021 날짜를 바꾸면 이전 날짜의 시드를 쓰지 않는다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    await h.viewModel.selectSort('random');
    await h.viewModel.goPrevious();
    const archive = h.transport.requests.filter((r) => r.url.includes('topicDate=2026-10-26'));
    expect(archive.length).toBeGreaterThan(0);
    expect(archive.every((r) => seedOf(r.url) === null)).toBe(true);
  });

  it('TC-DISP-042 같은 날짜의 아카이브를 재검증하면 추천 캐러셀 페이지를 유지하고 다른 날짜로 가면 처음으로 돌아간다', async () => {
    const h = await createDisplayHarness({
      routes: datedRoutes(['2026-10-25'], 'display/posts-list__popular-page1'),
    });
    await h.viewModel.openDate(d('2026-10-26'));
    h.viewModel.onFeaturedPageChanged(3);
    await h.viewModel.onTabReselected();
    expect(h.viewModel.getSnapshot().featuredPage).toBe(3);
    await h.viewModel.goPrevious();
    expect(h.viewModel.getSnapshot().featuredPage).toBe(0);
  });

  it('TC-DISP-043 아카이브에 사진이 5개 미만이면 있는 만큼만 추천에 쓰고 깨지지 않는다', async () => {
    const h = await createDisplayHarness({
      routes: { [q('2026-10-26', 'popular', 1)]: 'display/posts-list__popular-3' },
    });
    await h.viewModel.openDate(d('2026-10-26'));
    const s = h.viewModel.getSnapshot();
    expect(s.status).toBe('content');
    expect(s.featured).toHaveLength(3);
    expect(s.photos).toHaveLength(3);
  });

  it('TC-DISP-044 탭 재선택 재검증이 성공하면 새 값으로 교체하고 맨 위로 보낸다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    const token = h.viewModel.getSnapshot().scrollToTopToken;
    h.router.set(RECENT, 'display/posts-list__mixed-ratio');
    await h.viewModel.onTabReselected();
    expect(h.viewModel.getSnapshot().photos).toHaveLength(8);
    expect(h.viewModel.getSnapshot().scrollToTopToken).toBe(token + 1);
  });

  it('TC-DISP-044 재검증이 실패하면 기존 전시를 유지하고 토스트를 띄운다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    h.router.set(RECENT, 'display/posts-list__500-server-error');
    await h.viewModel.onTabReselected();
    expect(h.viewModel.getSnapshot().photos).toHaveLength(20);
    expect(h.toast.messages).toEqual([t('display.error')]);
  });

  it('TC-DISP-045 피드에서 복귀(onShown)하면 랜덤 시드와 페이지 꼬리를 유지하고 다음 페이지도 같은 시드로 요청한다', async () => {
    const h = await createDisplayHarness({
      routes: {
        [q('2026-10-27', 'random', 1, 'seed_abc123')]: 'display/posts-list__random-page1-seed',
      },
    });
    await h.viewModel.onShown();
    await h.viewModel.selectSort('random');
    await h.viewModel.onLastVisibleIndexChanged(19);
    h.viewModel.onHidden();
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({ sort: 'random' });
    expect(h.viewModel.getSnapshot().photos).toHaveLength(27);
    expect(h.callsOf(q('2026-10-27', 'random', 1, 'seed_abc123'))).toBe(1);
  });

  it('TC-DISP-047 정렬 A→B 빠른 전환에서 A의 늦은 응답은 B 화면을 덮지 않고 캐시에만 남는다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    const gate = gatedRoute(h.router, POPULAR, 'display/posts-list__popular-page1');
    const toPopular = h.viewModel.selectSort('popular');
    await flush();
    await h.viewModel.selectSort('random');
    const randomIds = idsOf(h);
    gate.release();
    await toPopular;
    expect(h.viewModel.getSnapshot().sort).toBe('random');
    expect(idsOf(h)).toEqual(randomIds);
    // A 결과는 캐시에 남아 다시 고르면 즉시 보인다.
    h.router.set(POPULAR, 'display/posts-list__popular-page1');
    void h.viewModel.selectSort('popular');
    expect(h.viewModel.getSnapshot().photos[0]?.id).toBe(ID('02'));
    expect(idsOf(h)).not.toEqual(randomIds);
  });
});
