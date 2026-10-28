import { reauth, refreshOk, unauthorized } from '../../core/http/__testing__/createNetHarness';
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
const RECENT2 = q('2026-10-27', 'recent', 2);
const POPULAR = q('2026-10-27', 'popular', 1);
const idsOf = (h: Awaited<ReturnType<typeof createDisplayHarness>>) =>
  h.viewModel.getSnapshot().photos.map((p) => p.id);

describe('DisplayViewModel 실패 뒤 복원', () => {
  it('TC-DISP-012 캐시 없는 정렬 변경이 실패하면 sort·preferredSort·추천이 직전 확정 값으로 돌아가고 페이지 이어 받기도 그 정렬로 이어진다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    const recent = idsOf(h);
    h.router.set(POPULAR, 'display/posts-list__500-server-error');
    await h.viewModel.selectSort('popular');
    expect(h.viewModel.getSnapshot()).toMatchObject({
      sort: 'recent',
      preferredSort: 'recent',
      featured: [],
      refreshing: false,
    });
    expect(idsOf(h)).toEqual(recent);
    expect(h.toast.messages).toEqual([t('display.error')]);

    await h.viewModel.onLastVisibleIndexChanged(19);
    expect(h.callsOf(RECENT2)).toBe(1);
    expect(h.viewModel.getSnapshot().photos).toHaveLength(recent.length + 7);
  });

  it('TC-DISP-040 자정이 지나 과거가 된 날짜의 재검증이 실패해도 직전 확정 값(정렬·추천)으로 돌아간다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    await h.viewModel.selectSort('random');
    const before = h.viewModel.getSnapshot();
    h.clock.set('2026-10-27T15:00:00Z'); // KST 10-28 00:00
    h.router.set(POPULAR, 'display/posts-list__500-server-error');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({
      sort: 'random',
      preferredSort: 'random',
      featured: before.featured,
      refreshing: false,
    });
    expect(h.viewModel.getSnapshot().photos).toEqual(before.photos);
  });
});

describe('DisplayViewModel 인증 오류 정책', () => {
  it('REAUTHENTICATION_REQUIRED는 화면이 아무것도 하지 않는다(로그인 이동·토스트 없음)', async () => {
    const h = await createDisplayHarness({
      routes: { [RECENT]: unauthorized(), 'POST /auth/refresh': () => reauth() },
    });
    await h.viewModel.onShown();
    expect(h.authFlow.calls).toEqual([]);
    expect(h.toast.messages).toEqual([]);
    expect(h.viewModel.getSnapshot().status).not.toBe('error');
  });

  it('남은 401은 로그인으로 한 번만 보내고 오류 화면·토스트는 없다', async () => {
    const h = await createDisplayHarness({
      routes: {
        [RECENT]: 'display/posts-list__401-unauthorized',
        'POST /auth/refresh': () => refreshOk(),
      },
    });
    await h.viewModel.onShown();
    expect(h.authFlow.calls).toEqual(['login']);
    expect(h.toast.messages).toEqual([]);
    expect(h.viewModel.getSnapshot().status).not.toBe('error');
  });

  it('페이지 이어 받기 중 401도 토스트 없이 로그인으로 보낸다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    h.router.set(RECENT2, 'display/posts-list__401-unauthorized');
    h.router.set('POST /auth/refresh', () => refreshOk());
    await h.viewModel.onLastVisibleIndexChanged(19);
    expect(h.authFlow.calls).toEqual(['login']);
    expect(h.toast.messages).toEqual([]);
    expect(h.viewModel.getSnapshot().paging).toBe(false);
  });
});

describe('DisplayViewModel 응답 중 제목 변경', () => {
  it('요청이 진행 중일 때 도착한 title-changed가 그 응답에도 반영된다', async () => {
    const h = await createDisplayHarness();
    const gate = gatedRoute(h.router, RECENT, 'display/posts-list__recent-page1');
    const loading = h.viewModel.onShown();
    await flush();
    const target = ID('01');
    h.changes.publish({ kind: 'title-changed', postId: target, title: '새 제목' });
    gate.release();
    await loading;
    expect(h.viewModel.getSnapshot().photos.find((p) => p.id === target)?.title).toBe('새 제목');
    // 캐시에도 남아 다시 고르면(응답 전) 새 제목이 바로 보인다.
    await h.viewModel.selectSort('popular');
    void h.viewModel.selectSort('recent');
    expect(h.viewModel.getSnapshot().photos.find((p) => p.id === target)?.title).toBe('새 제목');
  });

  it('요청을 보내기 전에 끝난 제목 변경은 서버의 최신 응답을 덮지 않는다', async () => {
    const h = await createDisplayHarness();
    const target = ID('01');
    h.changes.publish({ kind: 'title-changed', postId: target, title: '옛 제목' });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().photos.find((p) => p.id === target)?.title).not.toBe(
      '옛 제목',
    );
  });
});

describe('DisplayViewModel 캐시 크기', () => {
  it('(날짜, 정렬) 캐시는 최근 20개만 남기고 오래된 것부터 버린다', async () => {
    const dates = Array.from({ length: 21 }, (_, i) => `2026-10-${String(6 + i).padStart(2, '0')}`);
    const h = await createDisplayHarness({ routes: datedRoutes(dates) });
    await h.viewModel.onShown();
    for (const date of dates) await h.viewModel.pickDate(d(date));
    // 오늘(최신순)과 10-06이 밀려났다(총 22개 중 가장 오래된 2개).
    void h.viewModel.pickDate(d('2026-10-07'));
    expect(h.viewModel.getSnapshot().photos.length).toBeGreaterThan(0);
    await flush();
    void h.viewModel.pickDate(d('2026-10-06'));
    expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'loading', photos: [] });
    await flush();
  });
});
