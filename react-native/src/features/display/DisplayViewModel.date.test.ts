import { networkFailure } from '../../core/http/__testing__/FakeTransport';
import { d } from '../../core/time/__testing__/helpers';
import { t } from '../../shared/copy';
import { flush } from '../home/__testing__/createHomeHarness';
import {
  createDisplayHarness,
  datedRoutes,
  gatedRoute,
  q,
  topicRequests,
} from './__testing__/createDisplayHarness';

const NOT_FOUND = 'display/topics__404-not-found';

describe('DisplayViewModel 날짜 이동', () => {
  it('TC-DISP-028 최초 전시일에서는 이전 버튼이 비활성이고 이동 요청도 없다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.openDate(d('2026-09-17'));
    expect(h.viewModel.getSnapshot()).toMatchObject({ canGoPrevious: false, canGoNext: true });
    const requests = h.transport.requests.length;
    await h.viewModel.goPrevious();
    expect(h.transport.requests).toHaveLength(requests);
    expect(h.viewModel.getSnapshot().date.toString()).toBe('2026-09-17');
  });

  it('TC-DISP-028 2026-09-18에서 이전은 2026-09-17로 이동한다', async () => {
    const h = await createDisplayHarness({ routes: datedRoutes(['2026-09-18']) });
    await h.viewModel.openDate(d('2026-09-18'));
    await h.viewModel.goPrevious();
    expect(h.viewModel.getSnapshot().date.toString()).toBe('2026-09-17');
    expect(topicRequests(h).at(-1)).toBe('2026-09-17');
  });

  it('TC-DISP-029 오늘에서는 다음 버튼이 비활성이고 이동하지 않는다. 어제에서 다음은 오늘이다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().canGoNext).toBe(false);
    const requests = h.transport.requests.length;
    await h.viewModel.goNext();
    expect(h.transport.requests).toHaveLength(requests);
    await h.viewModel.goPrevious();
    await h.viewModel.goNext();
    expect(h.viewModel.getSnapshot().date.toString()).toBe('2026-10-27');
  });

  it.each([
    ['2026-10-01에서 이전', '2026-10-02', '2026-10-01', 'previous', '2026-09-30'],
    ['2027-01-01에서 이전', '2027-01-05', '2027-01-01', 'previous', '2026-12-31'],
    ['2026-12-31에서 다음', '2027-01-05', '2026-12-31', 'next', '2027-01-01'],
  ] as const)(
    'TC-DISP-030 %s는 요청 날짜가 정확한 yyyy-MM-dd(%s 기준 오늘)다',
    async (_name, today, from, direction, expected) => {
      const h = await createDisplayHarness({
        now: `${today}T03:00:00Z`,
        routes: datedRoutes([from, expected]),
      });
      await h.viewModel.openDate(d(from));
      if (direction === 'previous') await h.viewModel.goPrevious();
      else await h.viewModel.goNext();
      expect(topicRequests(h).at(-1)).toBe(expected);
      expect(h.viewModel.getSnapshot().date.toString()).toBe(expected);
    },
  );

  it('TC-DISP-031 이전 날짜의 /topics가 404이면 직전 전시와 날짜를 복원하고 최초 전시일을 바꾸지 않으며 안내 토스트를 띄운다', async () => {
    const h = await createDisplayHarness({ routes: { 'GET /topics?date=2026-10-26': NOT_FOUND } });
    await h.viewModel.onShown();
    const before = h.viewModel.getSnapshot().photos;
    await h.viewModel.goPrevious();
    const s = h.viewModel.getSnapshot();
    expect(s.date.toString()).toBe('2026-10-27');
    expect(s.photos).toEqual(before);
    expect(s.status).toBe('content');
    expect(s.minDate.toString()).toBe('2026-09-17');
    expect(h.toast.messages).toEqual([t('display.date-missing')]);
  });

  it('TC-DISP-032 날짜 선택으로 여러 날을 건너뛴 도착 날짜가 404여도 직전 전시를 복원하고 최초 전시일은 그대로다', async () => {
    const h = await createDisplayHarness({ routes: { 'GET /topics?date=2026-10-20': NOT_FOUND } });
    await h.viewModel.onShown();
    await h.viewModel.pickDate(d('2026-10-20'));
    expect(h.viewModel.getSnapshot().date.toString()).toBe('2026-10-27');
    expect(h.viewModel.getSnapshot().minDate.toString()).toBe('2026-09-17');
    expect(h.toast.messages).toEqual([t('display.date-missing')]);
  });

  it('TC-DISP-033 날짜 이동 중 네트워크 실패면 직전 성공 콘텐츠를 복원하고 네트워크 토스트를 띄운다', async () => {
    const h = await createDisplayHarness({
      routes: { 'GET /topics?date=2026-10-26': networkFailure() },
    });
    await h.viewModel.onShown();
    await h.viewModel.goPrevious();
    const s = h.viewModel.getSnapshot();
    expect(s).toMatchObject({ status: 'content', canGoPrevious: true });
    expect(s.date.toString()).toBe('2026-10-27');
    expect(h.toast.messages).toEqual([t('common.error.network')]);
  });

  it('TC-DISP-034 범위 밖 날짜(2026-09-01, 내일)를 고르면 범위 끝으로 맞춰 불러온다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    await h.viewModel.pickDate(d('2026-09-01'));
    expect(h.viewModel.getSnapshot().date.toString()).toBe('2026-09-17');
    await h.viewModel.openDate(d('2026-10-27'));
    const requests = h.transport.requests.length;
    await h.viewModel.pickDate(d('2026-10-28'));
    expect(h.viewModel.getSnapshot().date.toString()).toBe('2026-10-27');
    expect(h.transport.requests).toHaveLength(requests);
  });

  it('TC-DISP-035 현재 보는 날짜를 다시 선택하면 재요청하지 않는다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    const requests = h.transport.requests.length;
    await h.viewModel.pickDate(d('2026-10-27'));
    expect(h.transport.requests).toHaveLength(requests);
  });

  it('TC-DISP-038 이전 버튼 연타에서 최종 표시는 마지막 이동 날짜이고 중간 날짜의 늦은 응답이 덮지 않는다', async () => {
    const h = await createDisplayHarness({ routes: datedRoutes(['2026-10-25', '2026-10-24']) });
    await h.viewModel.onShown();
    const slow26 = gatedRoute(
      h.router,
      q('2026-10-26', 'popular', 1),
      'display/posts-list__popular-page1',
    );
    const slow25 = gatedRoute(
      h.router,
      q('2026-10-25', 'popular', 1),
      'display/posts-list__popular-page1',
    );
    const taps = [h.viewModel.goPrevious(), h.viewModel.goPrevious(), h.viewModel.goPrevious()];
    await flush();
    await Promise.all(taps.slice(2));
    slow25.release();
    slow26.release();
    await Promise.all(taps);
    const s = h.viewModel.getSnapshot();
    expect(s.date.toString()).toBe('2026-10-24');
    expect(s.photos).toHaveLength(3);
  });

  it('TC-DISP-046 날짜 A→B로 이동할 때 A의 느린 응답이 B 이후 도착해도 최신 상태를 덮지 않는다', async () => {
    const h = await createDisplayHarness({ routes: datedRoutes(['2026-10-20', '2026-10-22']) });
    await h.viewModel.onShown();
    const slowA = gatedRoute(
      h.router,
      q('2026-10-20', 'popular', 1),
      'display/posts-list__popular-page1',
    );
    const toA = h.viewModel.pickDate(d('2026-10-20'));
    await flush();
    await h.viewModel.pickDate(d('2026-10-22'));
    slowA.release();
    await toA;
    expect(h.viewModel.getSnapshot().date.toString()).toBe('2026-10-22');
    expect(h.viewModel.getSnapshot().photos).toHaveLength(3);
  });

  it('TC-DISP-039 KST 23:59:59(14:59:59Z)의 상한은 2026-10-27이고 15:00:00Z에는 2026-10-28이다', async () => {
    const before = await createDisplayHarness({ now: '2026-10-27T14:59:59Z' });
    expect(before.viewModel.getSnapshot().today.toString()).toBe('2026-10-27');
    const after = await createDisplayHarness({ now: '2026-10-27T15:00:00Z' });
    expect(after.viewModel.getSnapshot().today.toString()).toBe('2026-10-28');
  });

  it('TC-DISP-040 [가정: 쟁점 1 임시 처리] 자정 이후 복귀하면 상한만 새 오늘로 갱신하고 보던 날짜는 유지하며 다음 로드부터 아카이브(popular)로 취급한다', async () => {
    const h = await createDisplayHarness({
      routes: {
        ...datedRoutes(['2026-10-28']),
        [q('2026-10-27', 'popular', 1)]: 'display/posts-list__popular-page1',
      },
    });
    await h.viewModel.onShown();
    h.viewModel.onHidden();
    h.clock.set('2026-10-27T15:00:00Z');
    await h.viewModel.onShown();
    const s = h.viewModel.getSnapshot();
    expect(s.today.toString()).toBe('2026-10-28');
    expect(s.date.toString()).toBe('2026-10-27');
    expect(s).toMatchObject({ mode: 'archive', sort: 'popular', canGoNext: true });
  });
});
