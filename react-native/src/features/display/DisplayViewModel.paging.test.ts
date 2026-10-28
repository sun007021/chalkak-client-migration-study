import { t } from '../../shared/copy';
import { flush } from '../home/__testing__/createHomeHarness';
import { createDisplayHarness, gatedRoute, q } from './__testing__/createDisplayHarness';

const RECENT1 = q('2026-10-27', 'recent', 1);
const RECENT2 = q('2026-10-27', 'recent', 2);

describe('DisplayViewModel 페이징', () => {
  it('TC-DISP-022 끝에서 세 번째 항목 이내에 닿으면 다음 페이지를 1회만 요청하고(진행 중 중복 없음) 이어 붙인다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    await h.viewModel.onLastVisibleIndexChanged(16); // 20개 중 17번째: 아직 멀다
    expect(h.callsOf(RECENT2)).toBe(0);
    const gate = gatedRoute(h.router, RECENT2, 'display/posts-list__recent-page2');
    const first = h.viewModel.onLastVisibleIndexChanged(17);
    await flush();
    expect(h.viewModel.getSnapshot().paging).toBe(true);
    void h.viewModel.onLastVisibleIndexChanged(18);
    void h.viewModel.onLastVisibleIndexChanged(19);
    gate.release();
    await first;
    expect(h.callsOf(RECENT2)).toBe(1);
    expect(h.viewModel.getSnapshot()).toMatchObject({ paging: false, hasNext: false });
    expect(h.viewModel.getSnapshot().photos).toHaveLength(27);
    expect(new URL(h.router.calls(RECENT2)[0].url).searchParams.get('page')).toBe('2');
  });

  it('TC-DISP-023 hasNext=false이면 끝에 닿아도 요청이 없고, 빈 마지막 페이지 응답도 오류 없이 처리한다', async () => {
    const h = await createDisplayHarness({
      routes: { [RECENT2]: 'display/posts-list__page99-empty' },
    });
    await h.viewModel.onShown();
    await h.viewModel.onLastVisibleIndexChanged(19);
    expect(h.viewModel.getSnapshot()).toMatchObject({
      status: 'content',
      hasNext: false,
      paging: false,
    });
    expect(h.viewModel.getSnapshot().photos).toHaveLength(20);
    expect(h.toast.messages).toEqual([]);
    await h.viewModel.onLastVisibleIndexChanged(19);
    expect(h.callsOf(RECENT2)).toBe(1);
  });

  it('TC-DISP-024 첫 페이지 재검증 중에는 끝에 닿아도 다음 페이지를 요청하지 않는다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    const gate = gatedRoute(h.router, RECENT1, 'display/posts-list__recent-page1');
    const revalidating = h.viewModel.onTabReselected();
    await flush();
    await h.viewModel.onLastVisibleIndexChanged(19);
    expect(h.callsOf(RECENT2)).toBe(0);
    gate.release();
    await revalidating;
  });

  it('TC-DISP-025 2페이지까지 캐시된 뒤 첫 페이지만 재검증해도 캐시된 다음 페이지는 유지된다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    await h.viewModel.onLastVisibleIndexChanged(19);
    expect(h.viewModel.getSnapshot().photos).toHaveLength(27);
    await h.viewModel.onTabReselected();
    expect(h.callsOf(RECENT1)).toBe(2);
    expect(h.callsOf(RECENT2)).toBe(1);
    expect(h.viewModel.getSnapshot().photos).toHaveLength(27);
  });

  it('TC-DISP-026 다음 페이지 요청이 실패하면 토스트 후 같은 page를 다시 요청하고 이미 있는 사진은 유지된다', async () => {
    const h = await createDisplayHarness({
      routes: { [RECENT2]: 'display/posts-list__500-server-error' },
    });
    await h.viewModel.onShown();
    await h.viewModel.onLastVisibleIndexChanged(19);
    expect(h.toast.messages).toEqual([t('display.error')]);
    expect(h.viewModel.getSnapshot()).toMatchObject({
      status: 'content',
      paging: false,
      hasNext: true,
    });
    expect(h.viewModel.getSnapshot().photos).toHaveLength(20);
    h.router.set(RECENT2, 'display/posts-list__recent-page2');
    await h.viewModel.onLastVisibleIndexChanged(19);
    expect(new URL(h.router.calls(RECENT2)[0].url).searchParams.get('page')).toBe('2');
    expect(h.viewModel.getSnapshot().photos).toHaveLength(27);
  });

  it('TC-DISP-027 페이지 사이에 새 글로 오프셋이 밀려 같은 ID가 겹치면 중복만 제거한다', async () => {
    const h = await createDisplayHarness({
      routes: { [RECENT2]: 'display/posts-list__recent-page2-overlap' },
    });
    await h.viewModel.onShown();
    await h.viewModel.onLastVisibleIndexChanged(19);
    const ids = h.viewModel.getSnapshot().photos.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(26);
  });

  it('TC-DISP-010 다음 페이지 실패에도 오류 화면으로 바뀌지 않는다', async () => {
    const h = await createDisplayHarness({
      routes: { [RECENT2]: 'display/posts-list__500-server-error' },
    });
    await h.viewModel.onShown();
    await h.viewModel.onLastVisibleIndexChanged(19);
    expect(h.viewModel.getSnapshot().status).toBe('content');
  });
});
