import { d } from '../../core/time/__testing__/helpers';
import { YearMonth } from '../../core/time/YearMonth';
import { flush } from '../home/__testing__/createHomeHarness';
import { json } from '../../core/http/__testing__/FakeTransport';
import {
  cal,
  createRecordHarness,
  emptyMonth,
  gatedRoute,
  MONTHS,
  P_1027,
  P_1031,
  ymds,
} from './__testing__/createRecordHarness';

const ym = (year: number, month: number) => YearMonth.of(year, month);
const months = (h: { viewModel: { getSnapshot(): { availableMonths: readonly YearMonth[] } } }) =>
  h.viewModel.getSnapshot().availableMonths.map((m) => m.toString());

describe('RecordViewModel 진입과 월 선택지', () => {
  it('TC-REC-001 진입하면 월 목록과 KST 현재 달 달력을 부르고 Loading에서 Content로 바뀐다', async () => {
    const h = await createRecordHarness();
    const pending = h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().status).toBe('loading');
    await pending;
    const s = h.viewModel.getSnapshot();
    expect(s.status).toBe('content');
    expect(s.month.toString()).toBe('2026-10');
    expect(h.callsOf(MONTHS)).toBe(1);
    expect(h.callsOf(cal(2026, 10))).toBe(1);
    expect(ymds(s.photos)).toEqual(['2026-10-20', '2026-10-27', '2026-10-31']);
  });

  it('TC-REC-002 월 목록은 최신순·중복 없음이고 비어 있어도 현재 달만 선택지에 있다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    expect(months(h)).toEqual(['2026-10', '2026-09']);

    const empty = await createRecordHarness({
      routes: { [MONTHS]: 'record/posts-calendar-months__empty' },
    });
    await empty.viewModel.onShown();
    expect(months(empty)).toEqual(['2026-10']);
    expect(empty.viewModel.getSnapshot().status).toBe('content');
  });

  it('TC-REC-003 월 목록에 현재 달이 없어도 선택지에 포함된다', async () => {
    const h = await createRecordHarness({
      routes: { [MONTHS]: 'record/posts-calendar-months__without-current' },
    });
    await h.viewModel.onShown();
    expect(months(h)).toEqual(['2026-10', '2026-09']);
    expect(h.viewModel.getSnapshot().currentMonth.toString()).toBe('2026-10');
  });

  it('REQ-REC-008 월 목록 조회가 실패해도 현재 달 달력은 불러오고 토스트는 없다 [추정]', async () => {
    const h = await createRecordHarness({
      routes: { [MONTHS]: 'record/posts-calendar__500-server-error' },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().status).toBe('content');
    expect(months(h)).toEqual(['2026-10']);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-REC-004 월 목록에 없는 기록 없는 달(현재 달)도 선택·이동할 수 있고 빈 달로 표시된다', async () => {
    const h = await createRecordHarness({ now: '2026-08-15T03:00:00Z' });
    await h.viewModel.onShown();
    expect(months(h)).toContain('2026-08');
    expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'content', photos: [] });
    await h.viewModel.selectMonth(ym(2026, 9));
    expect(h.viewModel.getSnapshot().month.toString()).toBe('2026-09');
    await h.viewModel.selectMonth(ym(2026, 8));
    const s = h.viewModel.getSnapshot();
    expect(s.month.toString()).toBe('2026-08');
    expect(s).toMatchObject({ status: 'content', error: null, photos: [] });
  });

  it.each([
    ['2026-10-31T14:59:59Z', '2026-10'],
    ['2026-10-31T15:00:00Z', '2026-11'],
  ])('TC-REC-005 가짜 시계 %s의 현재 달은 %s(KST)이고 그 달을 불러온다', async (now, expected) => {
    const h = await createRecordHarness({ now });
    await h.viewModel.onShown();
    const s = h.viewModel.getSnapshot();
    expect(s.currentMonth.toString()).toBe(expected);
    expect(s.month.toString()).toBe(expected);
    const [year, month] = expected.split('-').map(Number);
    expect(h.callsOf(cal(year, month))).toBe(1);
  });

  it.each([
    ['2026-12-31T14:59:59Z', '2026-12', 2026, 12],
    ['2026-12-31T15:00:00Z', '2027-01', 2027, 1],
  ])('TC-REC-006 연말 경계 %s의 현재 달은 %s이다', async (now, expected, year, month) => {
    const h = await createRecordHarness({
      now,
      routes: { [cal(year, month)]: emptyMonth(year, month) },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().currentMonth.toString()).toBe(expected);
    expect(h.viewModel.getSnapshot().month.toString()).toBe(expected);
  });

  it('TC-REC-007 월이 바뀐 뒤 포그라운드로 돌아오면 현재 달을 다시 계산하고 보던 달·선택 날짜는 유지한다', async () => {
    const h = await createRecordHarness({ now: '2026-10-31T14:59:59Z' });
    await h.viewModel.onShown();
    h.viewModel.selectDate(d('2026-10-27'));
    h.clock.set('2026-10-31T15:00:00Z');
    h.visibility.emit('background');
    h.visibility.emit('foreground');
    await flush();
    const s = h.viewModel.getSnapshot();
    expect(s.currentMonth.toString()).toBe('2026-11');
    expect(months(h)).toContain('2026-11');
    expect(s.month.toString()).toBe('2026-10');
    expect(s.selectedDate?.toString()).toBe('2026-10-27');
  });

  it('TC-REC-007 탭에 다시 들어와도 현재 달을 다시 계산한다', async () => {
    const h = await createRecordHarness({ now: '2026-10-31T14:59:59Z' });
    await h.viewModel.onShown();
    h.viewModel.onHidden();
    h.clock.set('2026-10-31T15:00:00Z');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().currentMonth.toString()).toBe('2026-11');
  });

  it('TC-REC-007 포그라운드 구독은 보이는 동안만 있다', async () => {
    const h = await createRecordHarness();
    expect(h.visibility.listenerCount).toBe(0);
    await h.viewModel.onShown();
    expect(h.visibility.listenerCount).toBe(1);
    h.viewModel.onHidden();
    expect(h.visibility.listenerCount).toBe(0);
  });

  it('TC-REC-033 게스트 모드의 ViewModel은 API를 부르지 않는다', async () => {
    const h = await createRecordHarness({ mode: 'guest' });
    await h.viewModel.onShown();
    expect(h.transport.requests).toHaveLength(0);
  });
});

describe('RecordViewModel 월 이동', () => {
  it('TC-REC-016 이전 달 화살표는 해당 월 calendar를 요청하고 처음 가는 달은 기존 기록을 비우고 로딩한다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    const gate = gatedRoute(h.router, cal(2026, 9), 'record/posts-calendar__2026-09');
    const pending = h.viewModel.goPrevious();
    const loading = h.viewModel.getSnapshot();
    expect(loading.month.toString()).toBe('2026-09');
    expect(loading.status).toBe('loading');
    expect(loading.photos).toEqual([]);
    expect(loading.selectedDate).toBeNull();
    gate.release();
    await pending;
    expect(ymds(h.viewModel.getSnapshot().photos)).toEqual(['2026-09-17', '2026-09-30']);
    expect(h.callsOf(cal(2026, 9))).toBe(1);
  });

  it('TC-REC-016 REQ-REC-005 기록 없는 달로도 이동하고 선택지 끝에서는 화살표를 쓸 수 없다', async () => {
    const h = await createRecordHarness({
      routes: {
        [MONTHS]: 'record/posts-calendar-months__multi-year',
        [cal(2025, 12)]: emptyMonth(2025, 12),
        [cal(2025, 3)]: emptyMonth(2025, 3),
      },
    });
    await h.viewModel.onShown();
    let s = h.viewModel.getSnapshot();
    expect(s.canGoNext).toBe(false);
    expect(s.canGoPrevious).toBe(true);
    await h.viewModel.goPrevious();
    await h.viewModel.goPrevious();
    s = h.viewModel.getSnapshot();
    expect(s.month.toString()).toBe('2025-12');
    expect(s).toMatchObject({ status: 'content', photos: [], canGoNext: true });
    await h.viewModel.goPrevious();
    s = h.viewModel.getSnapshot();
    expect(s.month.toString()).toBe('2025-03');
    expect(s.canGoPrevious).toBe(false);
    const before = h.transport.requests.length;
    await h.viewModel.goPrevious();
    expect(h.transport.requests).toHaveLength(before);
    expect(h.viewModel.getSnapshot().month.toString()).toBe('2025-03');
  });

  it('TC-REC-017 선택지에 없는 달이나 이미 불러온 현재 달을 고르면 calendar를 다시 요청하지 않는다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    const before = h.viewModel.getSnapshot();
    await h.viewModel.selectMonth(ym(2026, 10));
    await h.viewModel.selectMonth(ym(2026, 7));
    expect(h.callsOf(cal(2026, 10))).toBe(1);
    expect(h.callsOf(cal(2026, 7))).toBe(0);
    expect(h.viewModel.getSnapshot()).toBe(before);
  });

  it('TC-REC-018 연도를 바꾸면 그 해에 기록이 있는 달 중 가장 가까운 달이 선택된다', async () => {
    const routes = {
      [MONTHS]: 'record/posts-calendar-months__multi-year',
      [cal(2025, 12)]: emptyMonth(2025, 12),
      [cal(2025, 3)]: emptyMonth(2025, 3),
    };
    const h = await createRecordHarness({ routes });
    await h.viewModel.onShown();
    await h.viewModel.selectYear(2025);
    expect(h.viewModel.getSnapshot().month.toString()).toBe('2025-12');
    await h.viewModel.selectYear(2026);
    expect(h.viewModel.getSnapshot().month.toString()).toBe('2026-10');
  });

  it('TC-REC-018 첫 해·마지막 해 범위를 벗어난 연도는 끝으로 맞춘다', async () => {
    const routes = {
      [MONTHS]: 'record/posts-calendar-months__multi-year',
      [cal(2025, 12)]: emptyMonth(2025, 12),
    };
    const h = await createRecordHarness({ routes });
    await h.viewModel.onShown();
    await h.viewModel.selectYear(2030);
    expect(h.viewModel.getSnapshot().month.toString()).toBe('2026-10');
    await h.viewModel.selectYear(2020);
    expect(h.viewModel.getSnapshot().month.toString()).toBe('2025-12');
  });

  it('TC-REC-019 월 이동 버튼을 연타해도 마지막 선택 달만 표시되고 늦은 응답이 화면을 덮지 않는다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    const gate = gatedRoute(h.router, cal(2026, 9), 'record/posts-calendar__2026-09');
    const first = h.viewModel.goPrevious();
    const second = h.viewModel.goNext();
    expect(h.viewModel.getSnapshot().month.toString()).toBe('2026-10');
    gate.release();
    await Promise.all([first, second]);
    const s = h.viewModel.getSnapshot();
    expect(s.month.toString()).toBe('2026-10');
    expect(ymds(s.photos)).toEqual(['2026-10-20', '2026-10-27', '2026-10-31']);
  });

  it('TC-REC-031 400 BUSINESS_ERROR는 문구와 상관없이 "조회할 수 없는 연월" 오류다', async () => {
    const h = await createRecordHarness({
      routes: {
        [cal(2026, 10)]: () =>
          json(400, { errorCode: 'BUSINESS_ERROR', message: '서버가 바꾼 다른 문구' }),
      },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'invalid-month',
      photos: [],
    });
  });
});

describe('RecordViewModel 날짜 선택', () => {
  it('TC-REC-036 사용자가 정하지 않았다면 가장 최근 기록 날짜가 선택된다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    const s = h.viewModel.getSnapshot();
    expect(s.selectedDate?.toString()).toBe('2026-10-31');
    expect(s.selectedPhoto?.postId).toBe(P_1031);
  });

  it('TC-REC-037 REQ-REC-030 사진 없는 날짜를 누르면 아무 일도 없고, 사진 있는 날짜는 선택된다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    h.viewModel.selectDate(d('2026-10-15'));
    expect(h.viewModel.getSnapshot().selectedDate?.toString()).toBe('2026-10-31');
    h.viewModel.selectDate(d('2026-10-27'));
    const s = h.viewModel.getSnapshot();
    expect(s.selectedDate?.toString()).toBe('2026-10-27');
    expect(s.selectedPhoto?.postId).toBe(P_1027);
  });

  it('TC-REC-037 기록 없는 달은 선택 날짜가 없고 오류가 아니다', async () => {
    const h = await createRecordHarness({ now: '2026-08-15T03:00:00Z' });
    await h.viewModel.onShown();
    h.viewModel.selectDate(d('2026-08-10'));
    expect(h.viewModel.getSnapshot()).toMatchObject({
      status: 'content',
      error: null,
      selectedDate: null,
      selectedPhoto: null,
    });
  });

  it('TC-REC-008 주제 날짜 10/31 사진은 10월 칸에 있고 11월에는 나타나지 않는다', async () => {
    const h = await createRecordHarness();
    await h.viewModel.onShown();
    expect(ymds(h.viewModel.getSnapshot().photos)).toContain('2026-10-31');
    h.clock.set('2026-11-01T03:00:00Z');
    h.viewModel.onHidden();
    await h.viewModel.onShown();
    await h.viewModel.selectMonth(ym(2026, 11));
    expect(h.viewModel.getSnapshot().photos.map((p) => p.postId)).not.toContain(P_1031);
  });
});
