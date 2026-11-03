import { deferred } from '../../test/deferred';
import { gated } from '../../test/displayAsserts';
import { json } from '../../test/fixtureRouter';
import { guestSession } from '../../test/fixtures';
import { finish, settle } from '../../test/homeHarness';
import { datesOf, createRecordHarness, postNumbers, readyBody } from '../../test/recordHarness';
import type { RecordHarness } from '../../test/recordHarness';
import { AUG, MONTHS_KEY, NOV, OCT, OCT_20, OCT_31, SEP, SEP_17, monthResponse, monthsBody, recordRequests, thumbOf } from '../../test/recordRoutes';

const ym = (year: number, month: number) => ({ year, month });
const offline = () => Promise.reject(new TypeError('Failed to fetch'));

async function open(h: RecordHarness) {
  await finish(h, h.viewModel.onShown());
  return h.viewModel;
}

describe('RecordViewModel 첫 진입 (REQ-REC-001, 004, 017)', () => {
  it('TC-REC-001 TC-NAV-024 기록 탭에 들어오면 월 목록과 KST 현재 달(2026-10) 달력을 부르고 Loading → Content로 바뀐다', async () => {
    const gate = deferred<void>();
    const h = createRecordHarness({ routes: { [OCT]: gated(gate, 'record/posts-calendar__2026-10') } });
    const vm = h.viewModel;
    const statuses: string[] = [vm.state.body.status];
    vm.subscribe(() => statuses.push(vm.state.body.status));
    const shown = vm.onShown();
    await settle();
    expect(vm.state.body).toEqual({ status: 'loading' });
    expect(vm.state.month).toEqual(ym(2026, 10));
    gate.resolve();
    await finish(h, shown);
    expect(vm.state.body.status).toBe('ready');
    expect(statuses[0]).toBe('loading');
    expect(statuses.at(-1)).toBe('ready');
    expect(statuses.filter((s) => s === 'error')).toHaveLength(0);
    expect(recordRequests(h.ff.calls).sort()).toEqual(['/posts/calendar/months', '/posts/calendar?year=2026&month=10']);
  });

  it('REQ-REC-004 TC-REC-036 첫 진입의 달은 현재 달이고 선택 날짜는 그 달에서 가장 늦은 사진의 날짜다', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    expect(vm.state).toMatchObject({
      today: '2026-10-27',
      currentMonth: ym(2026, 10),
      month: ym(2026, 10),
      selectedDate: '2026-10-31',
      canGoNext: false,
      canGoPrevious: true,
      pendingHintOpen: false,
      saving: false,
    });
    expect(vm.state.selectedPost?.postId).toBe(OCT_31);
    expect(readyBody(vm)).toMatchObject({ revalidating: false });
    expect(datesOf(vm)).toEqual(['2026-10-20', '2026-10-27', '2026-10-31']);
    expect(readyBody(vm).posts.map((p) => p.status)).toEqual(['APPROVED', 'PENDING', 'APPROVED']);
  });

  it('TC-REC-008 날짜 칸은 서버가 준 주제 날짜(topicDate) 문자열로 정한다: 10/31 사진은 10월에 있고 11월에는 없다', async () => {
    const h = createRecordHarness({ now: '2026-10-31T15:30:00Z', routes: { [NOV]: 'record/posts-calendar__2026-11-empty' } }); // KST 11/1 00:30
    const vm = await open(h);
    expect(vm.state.month).toEqual(ym(2026, 11));
    expect(datesOf(vm)).toEqual([]);
    await finish(h, vm.selectPreviousMonth());
    expect(datesOf(vm)).toContain('2026-10-31');
  });

  it('TC-REC-002 월 선택지는 서버 목록과 현재 달의 합집합(최신순)이고 월 목록이 비어도 오류 없이 현재 달만 있다', async () => {
    const h = createRecordHarness({ routes: { [MONTHS_KEY]: 'record/posts-calendar-months__empty' } });
    const vm = await open(h);
    expect(vm.state.availableMonths).toEqual([ym(2026, 10)]);
    expect(vm.state).toMatchObject({ canGoPrevious: false, canGoNext: false });
    expect(vm.state.body.status).toBe('ready');
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-REC-002 서버 목록이 최신순 [10, 9]이면 그대로 선택지가 된다', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    expect(vm.state.availableMonths).toEqual([ym(2026, 10), ym(2026, 9)]);
  });

  it('TC-REC-003 월 목록에 현재 달(2026-10)이 없어도 선택지에 포함되고 첫 진입 달이 된다', async () => {
    const h = createRecordHarness({ routes: { [MONTHS_KEY]: 'record/posts-calendar-months__without-current' } });
    const vm = await open(h);
    expect(vm.state.availableMonths).toEqual([ym(2026, 10), ym(2026, 9)]);
    expect(vm.state.month).toEqual(ym(2026, 10));
  });

  it('REQ-REC-008 월 목록 조회가 실패해도 현재 달 달력 조회는 계속하고 토스트는 없다', async () => {
    const h = createRecordHarness({ routes: { [MONTHS_KEY]: 'record/posts-calendar__500-server-error' } });
    const vm = await open(h);
    expect(vm.state.availableMonths).toEqual([ym(2026, 10)]);
    expect(vm.state.body.status).toBe('ready');
    expect(h.toasts.messages).toEqual([]);
  });

  it('REQ-REC-008 월 목록이 연결 실패여도 현재 달 달력은 읽고 오류 화면을 보이지 않는다', async () => {
    const h = createRecordHarness({ routes: { [MONTHS_KEY]: offline } });
    const vm = await open(h);
    expect(vm.state.body.status).toBe('ready');
    expect(vm.state.availableMonths).toEqual([ym(2026, 10)]);
    expect(h.toasts.messages).toEqual([]);
  });
});

describe('RecordViewModel 월 이동 (REQ-REC-005, 006, TC-REC-004, 016, 017)', () => {
  it('TC-REC-016 이전 달 화살표는 해당 월 달력을 요청하고, 처음 가는 달은 기존 기록을 비우고 로딩을 보인다', async () => {
    const gate = deferred<void>();
    const h = createRecordHarness({ routes: { [SEP]: gated(gate, 'record/posts-calendar__2026-09') } });
    const vm = await open(h);
    const moving = vm.selectPreviousMonth();
    await settle();
    expect(vm.state.month).toEqual(ym(2026, 9));
    expect(vm.state.body).toEqual({ status: 'loading' });
    expect(h.router.calls(SEP)).toHaveLength(1);
    gate.resolve();
    await finish(h, moving);
    expect(datesOf(vm)).toEqual(['2026-09-17', '2026-09-30']);
    expect(vm.state.selectedDate).toBe('2026-09-30');
    expect(vm.state).toMatchObject({ canGoPrevious: false, canGoNext: true });
  });

  it('REQ-REC-005 가장 오래된 달에서는 이전, 가장 최신 달에서는 다음 이동이 아무 일도 하지 않는다(요청도 없다)', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    const before = h.ff.calls.length;
    await finish(h, vm.selectNextMonth()); // 이미 가장 최신
    expect(vm.state.month).toEqual(ym(2026, 10));
    await finish(h, vm.selectPreviousMonth());
    await finish(h, vm.selectPreviousMonth()); // 이미 가장 오래됨
    expect(vm.state.month).toEqual(ym(2026, 9));
    expect(h.ff.calls.length - before).toBe(1); // 9월 요청 하나뿐
  });

  it('TC-REC-004 REQ-REC-020 기록이 없는 달로도 이동할 수 있고 빈 달(오류 아님, 선택 없음)로 보인다', async () => {
    const h = createRecordHarness({ routes: { [MONTHS_KEY]: () => json(200, monthsBody([2026, 10], [2026, 9], [2026, 8])) } });
    const vm = await open(h);
    await finish(h, vm.selectMonth(ym(2026, 8)));
    expect(h.router.calls(AUG)).toHaveLength(1);
    expect(vm.state).toMatchObject({ month: ym(2026, 8), selectedDate: null, selectedPost: null });
    expect(vm.state.body).toEqual({ status: 'ready', posts: [], revalidating: false });
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-REC-017 REQ-REC-006 선택지에 없는 달을 고르면 요청도 상태 변화도 없다', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    const before = h.ff.calls.length;
    const state = vm.state;
    await finish(h, vm.selectMonth(ym(2026, 7)));
    await finish(h, vm.selectMonth(ym(2025, 10)));
    await finish(h, vm.selectMonth(ym(2026, 13)));
    expect(h.ff.calls.length).toBe(before);
    expect(vm.state).toBe(state);
  });

  it('TC-REC-017 REQ-REC-006 이미 보고 있는 달을 다시 고르면 calendar 재요청이 없다', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    const before = h.ff.calls.length;
    const state = vm.state;
    await finish(h, vm.selectMonth(ym(2026, 10)));
    expect(h.ff.calls.length).toBe(before);
    expect(vm.state).toBe(state);
  });

  it('REQ-REC-005 월 선택(selectMonth)은 선택지 안의 달로 이동한다', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    await finish(h, vm.selectMonth(ym(2026, 9)));
    expect(vm.state.month).toEqual(ym(2026, 9));
    expect(postNumbers(vm)).toEqual(['297', '296']);
  });
});

describe('RecordViewModel 날짜 선택 (REQ-REC-030, 031, TC-REC-036, 037)', () => {
  it('REQ-REC-030 사진이 있는 날짜는 선택되고 selectedPost가 따라온다', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    vm.selectDate('2026-10-20');
    expect(vm.state.selectedDate).toBe('2026-10-20');
    expect(vm.state.selectedPost).toMatchObject({ postId: OCT_20, status: 'APPROVED' });
  });

  it('REQ-REC-030 TC-REC-037 사진이 없는 날짜·다른 달 날짜·잘못된 날짜를 고르면 아무 일도 하지 않는다', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    vm.selectDate('2026-10-20');
    const state = vm.state;
    for (const date of ['2026-10-21', '2026-09-17', '2026-11-02', 'garbage']) vm.selectDate(date);
    expect(vm.state).toBe(state);
  });

  it('REQ-REC-031 사진이 하나도 없는 달의 기본 선택은 선택 없음이다', async () => {
    const h = createRecordHarness({ now: '2026-11-03T03:00:00Z', routes: { [NOV]: 'record/posts-calendar__2026-11-empty' } });
    const vm = await open(h);
    expect(vm.state).toMatchObject({ month: ym(2026, 11), selectedDate: null, selectedPost: null });
    expect(vm.state.body).toEqual({ status: 'ready', posts: [], revalidating: false });
  });
});

describe('RecordViewModel 사진 패널 동작 (REQ-REC-033~035, TC-REC-034, 035)', () => {
  it('TC-REC-034 APPROVED 사진의 "피드에서 보기"는 postId와 썸네일 URL을 넘겨 내 게시물로 연다', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    vm.selectDate('2026-10-20');
    vm.openFeed();
    expect(h.navigator.calls).toEqual([{ type: 'feed', postId: OCT_20, thumbnailImageUrl: thumbOf(OCT_20) }]);
  });

  it('TC-REC-034 REQ-REC-035 "전시 보러가기"는 그 사진의 topicDate로 전시를 연다', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    vm.selectDate('2026-10-20');
    vm.openDisplay();
    expect(h.navigator.calls).toEqual([{ type: 'display', date: '2026-10-20' }]);
  });

  it('TC-REC-035 PENDING 사진에는 두 동작이 없다: 호출해도 이동하지 않고 상세 API도 부르지 않는다', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    vm.selectDate('2026-10-27');
    expect(vm.state.selectedPost?.status).toBe('PENDING');
    vm.openFeed();
    vm.openDisplay();
    await settle();
    expect(h.navigator.calls).toEqual([]);
    expect(h.ff.calls.map((c) => c.path).filter((p) => /^\/posts\/[^c]/.test(p))).toEqual([]);
  });

  it('REQ-REC-033 선택이 없으면 두 동작은 아무 일도 하지 않는다', async () => {
    const h = createRecordHarness({ routes: { [OCT]: monthResponse(2026, 10) } });
    const vm = await open(h);
    vm.openFeed();
    vm.openDisplay();
    expect(h.navigator.calls).toEqual([]);
  });

  it('REQ-REC-015 PENDING 사진을 선택했을 때만 배지 안내 풍선을 열고 닫을 수 있다', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    vm.togglePendingHint(); // 선택은 APPROVED(10/31): 배지가 없다
    expect(vm.state.pendingHintOpen).toBe(false);
    vm.selectDate('2026-10-27');
    vm.togglePendingHint();
    expect(vm.state.pendingHintOpen).toBe(true);
    vm.togglePendingHint();
    expect(vm.state.pendingHintOpen).toBe(false);
  });
});

describe('RecordViewModel 홈 등에서 날짜를 지정해 진입 (REQ-REC-032, TC-REC-025, 026)', () => {
  it('TC-REC-025 이전 달 날짜를 지정하면 그 달과 날짜가 선택되고 최신 사진보다 우선하며 현재 달 달력은 읽지 않는다', async () => {
    const h = createRecordHarness();
    const vm = h.viewModel;
    await finish(h, vm.applyRoute({ date: '2026-09-17' }));
    expect(vm.state).toMatchObject({ month: ym(2026, 9), selectedDate: '2026-09-17' });
    expect(vm.state.selectedPost?.postId).toBe(SEP_17);
    expect(h.router.calls(OCT)).toHaveLength(0);
  });

  it('TC-REC-025 지정 날짜는 재검증(탭 재선택·복귀)에도 유지된다', async () => {
    const h = createRecordHarness();
    const vm = h.viewModel;
    await finish(h, vm.applyRoute({ date: '2026-09-17' }));
    await finish(h, vm.onTabReselect());
    await finish(h, vm.onShown());
    expect(vm.state).toMatchObject({ month: ym(2026, 9), selectedDate: '2026-09-17' });
  });

  it('TC-REC-025 applyRoute 직후 onShown이 이어져도(화면 마운트 순서) 같은 요청을 다시 보내지 않는다', async () => {
    const gate = deferred<void>();
    const h = createRecordHarness({ routes: { [SEP]: gated(gate, 'record/posts-calendar__2026-09') } });
    const vm = h.viewModel;
    const route = vm.applyRoute({ date: '2026-09-17' });
    const shown = vm.onShown();
    await settle();
    gate.resolve();
    await finish(h, Promise.all([route, shown]));
    expect(h.router.calls(SEP)).toHaveLength(1);
    expect(h.router.calls(MONTHS_KEY)).toHaveLength(1);
    expect(h.router.calls(OCT)).toHaveLength(0);
    expect(vm.state).toMatchObject({ month: ym(2026, 9), selectedDate: '2026-09-17' });
  });

  it('TC-REC-025 본 적 있는 달이면 응답 전에도 캐시에서 그 날짜 사진을 보여 준다', async () => {
    const gate = deferred<void>();
    const h = createRecordHarness({ routes: { [SEP]: ['record/posts-calendar__2026-09', gated(gate, 'record/posts-calendar__2026-09')] } });
    const vm = await open(h);
    await finish(h, vm.selectPreviousMonth());
    await finish(h, vm.selectNextMonth());
    expect(vm.state.month).toEqual(ym(2026, 10));
    const route = vm.applyRoute({ date: '2026-09-17' });
    await settle();
    expect(vm.state).toMatchObject({ month: ym(2026, 9), selectedDate: '2026-09-17' });
    expect(vm.state.body).toMatchObject({ status: 'ready', revalidating: true });
    expect(vm.state.selectedPost?.postId).toBe(SEP_17);
    gate.resolve();
    await finish(h, route);
    expect(vm.state.body).toMatchObject({ status: 'ready', revalidating: false });
  });

  it('REQ-REC-032 날짜가 null이면 아무것도 하지 않는다(탭으로 다시 들어온 URL에는 date가 없다)', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    vm.selectDate('2026-10-20');
    const before = h.ff.calls.length;
    await finish(h, vm.applyRoute({ date: null }));
    expect(h.ff.calls.length).toBe(before);
    expect(vm.state.selectedDate).toBe('2026-10-20');
  });

  it('REQ-REC-032 지금 선택과 같은 값을 다시 지정하면 요청도 상태 변화도 없다(URL 동기화가 같은 값을 되돌려 준다)', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    const before = h.ff.calls.length;
    const state = vm.state;
    await finish(h, vm.applyRoute({ date: '2026-10-31' }));
    expect(h.ff.calls.length).toBe(before);
    expect(vm.state).toBe(state);
  });

  it('TC-REC-026 REQ-REC-032 지정한 날짜에 사진이 없으면 가까운 다른 날짜를 대신 열지 않고 기본 선택(가장 늦은 날짜)을 따른다', async () => {
    const h = createRecordHarness();
    const vm = h.viewModel;
    await finish(h, vm.applyRoute({ date: '2026-10-22' })); // 10/20이 가깝지만 열지 않는다
    expect(vm.state).toMatchObject({ month: ym(2026, 10), selectedDate: '2026-10-31' });
  });

  it('TC-REC-026 홈에서 선택한 날짜의 게시물이 삭제됨(서버 응답에 없음): 다른 사진을 대신 열지 않는다', async () => {
    const h = createRecordHarness({ routes: { [OCT]: 'record/posts-calendar__2026-10-after-delete' } });
    const vm = h.viewModel;
    await finish(h, vm.applyRoute({ date: '2026-10-27' }));
    expect(datesOf(vm)).toEqual(['2026-10-20', '2026-10-31']);
    expect(vm.state.selectedDate).toBe('2026-10-31'); // 요청한 날짜가 아니라 기본 선택
    expect(vm.state.selectedDate).not.toBe('2026-10-20');
  });

  it('TC-REC-026 첫 조회가 실패한 뒤 다시 시도해도 요청한 날짜를 선택한다', async () => {
    const h = createRecordHarness({ routes: { [SEP]: 'record/posts-calendar__500-server-error' } });
    const vm = h.viewModel;
    await finish(h, vm.applyRoute({ date: '2026-09-17' }));
    expect(vm.state.body).toEqual({ status: 'error', kind: 'other' });
    h.router.set(SEP, 'record/posts-calendar__2026-09');
    await finish(h, vm.retry());
    expect(vm.state).toMatchObject({ month: ym(2026, 9), selectedDate: '2026-09-17' });
  });

  it('REQ-REC-032 선택지에 없는 달의 날짜를 지정하면 무시하고 현재 달의 기본 선택을 연다(임시)', async () => {
    const h = createRecordHarness();
    const vm = h.viewModel;
    await finish(h, vm.applyRoute({ date: '2026-07-04' }));
    expect(vm.state).toMatchObject({ month: ym(2026, 10), selectedDate: '2026-10-31' });
    expect(h.router.calls(calendarOf(2026, 7))).toHaveLength(0);
  });
});

const calendarOf = (year: number, month: number) => `GET /posts/calendar?year=${year}&month=${month}`;

describe('RecordViewModel 첫 불러오기 오류 (REQ-REC-018, 019, 024, TC-REC-012~014, 029~032)', () => {
  it.each([
    ['TC-REC-012 응답 month가 요청과 다름', 'record/posts-calendar__month-mismatch'],
    ['TC-REC-013 날짜가 그 달 밖', 'record/posts-calendar__date-out-of-month'],
    ['TC-REC-013 같은 날짜 중복', 'record/posts-calendar__duplicate-date'],
    ['TC-REC-013 썸네일 URL이 빈 문자열', 'record/posts-calendar__empty-thumbnail'],
    ['TC-REC-014 알 수 없는 status', 'record/posts-calendar__unknown-status'],
  ])('%s: 계약 위반 응답은 버리고 오류 화면(other)이다 — 앱은 깨지지 않는다', async (_name, fixture) => {
    const h = createRecordHarness({ routes: { [OCT]: fixture } });
    const vm = await open(h);
    expect(vm.state.body).toEqual({ status: 'error', kind: 'other' });
    expect(vm.state.selectedDate).toBeNull();
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-REC-032 서버 500이면 오류 화면(other)이고 다시 시도로 복구된다', async () => {
    const h = createRecordHarness({ routes: { [OCT]: 'record/posts-calendar__500-server-error' } });
    const vm = await open(h);
    expect(vm.state.body).toEqual({ status: 'error', kind: 'other' });
    h.router.set(OCT, 'record/posts-calendar__2026-10');
    const retrying = vm.retry();
    await settle();
    expect(vm.state.body.status).toBe('loading');
    await finish(h, retrying);
    expect(vm.state.body.status).toBe('ready');
  });

  it('TC-REC-031 서버 400(조회 연월이 올바르지 않습니다)은 invalid-month 오류 화면이다', async () => {
    const h = createRecordHarness({ routes: { [OCT]: 'record/posts-calendar__400-invalid-month' } });
    const vm = await open(h);
    expect(vm.state.body).toEqual({ status: 'error', kind: 'invalid-month' });
  });

  it('TC-REC-030 인증 불가 상태에서 직접 진입해 401이면 unauthorized 오류 화면이다', async () => {
    const h = createRecordHarness({ session: guestSession, routes: { [OCT]: 'record/posts-calendar__401-unauthorized', [MONTHS_KEY]: 'record/posts-calendar__401-unauthorized' } });
    const vm = await open(h);
    expect(vm.state.body).toEqual({ status: 'error', kind: 'unauthorized' });
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(0);
  });

  it('TC-REC-030 REAUTHENTICATION_REQUIRED도 unauthorized로 보이고 세션 만료 이벤트는 한 번 난다(로그인 이동은 앱 셸)', async () => {
    const h = createRecordHarness({ routes: { [OCT]: 'record/posts-calendar__401-unauthorized', [MONTHS_KEY]: 'record/posts-calendar__401-unauthorized' } });
    h.ff.route('POST /auth/refresh', () => json(401, { errorCode: 'REAUTHENTICATION_REQUIRED', message: '재인증이 필요합니다.' }));
    const vm = await open(h);
    expect(vm.state.body).toEqual({ status: 'error', kind: 'unauthorized' });
    expect(h.expired.count).toBe(1);
  });

  it('TC-REC-029 오프라인 첫 진입은 network 오류 화면이고 온라인 복귀 후 다시 시도하면 성공 로드된다(월 목록도 다시 읽는다)', async () => {
    const h = createRecordHarness({ routes: { [OCT]: offline, [MONTHS_KEY]: offline } });
    const vm = await open(h);
    expect(vm.state.body).toEqual({ status: 'error', kind: 'network' });
    expect(vm.state.availableMonths).toEqual([ym(2026, 10)]);
    expect(h.toasts.messages).toEqual([]); // 내용이 없을 때는 오류 화면만
    h.router.set(OCT, 'record/posts-calendar__2026-10');
    h.router.set(MONTHS_KEY, 'record/posts-calendar-months__recent-first');
    await finish(h, vm.retry());
    expect(vm.state.body.status).toBe('ready');
    expect(vm.state.availableMonths).toEqual([ym(2026, 10), ym(2026, 9)]);
  });

  it('TC-REC-021 처음 가는 달의 실패는 오류(+다시 시도)이고 이전 달 내용이 남지 않는다', async () => {
    const h = createRecordHarness({ routes: { [SEP]: 'record/posts-calendar__500-server-error' } });
    const vm = await open(h);
    await finish(h, vm.selectPreviousMonth());
    expect(vm.state.month).toEqual(ym(2026, 9));
    expect(vm.state.body).toEqual({ status: 'error', kind: 'other' });
    expect('posts' in vm.state.body).toBe(false);
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-REC-021 현재 달 첫 불러오기가 실패하면 이전에 보던 달의 내용이 남지 않는다', async () => {
    const h = createRecordHarness({ routes: { [OCT]: 'record/posts-calendar__500-server-error' } });
    const vm = h.viewModel;
    await finish(h, vm.applyRoute({ date: '2026-09-17' }));
    expect(datesOf(vm)).toEqual(['2026-09-17', '2026-09-30']);
    await finish(h, vm.selectNextMonth());
    expect(vm.state.body).toEqual({ status: 'error', kind: 'other' });
    expect(vm.state.selectedDate).toBeNull();
    expect(vm.state.selectedPost).toBeNull();
  });
});

describe('RecordViewModel 화면 이탈과 게스트 (TC-REC-027, 033)', () => {
  it('TC-REC-027 화면을 벗어나 첫 조회가 취소되면 오류가 아니라 로딩으로 남고, 다시 나타나면 불러온다', async () => {
    const gate = deferred<void>();
    const h = createRecordHarness({ routes: { [OCT]: [gated(gate, 'record/posts-calendar__2026-10'), 'record/posts-calendar__2026-10'] } });
    const vm = h.viewModel;
    const first = vm.onShown();
    await settle();
    const request = h.ff.callsTo('GET /posts/calendar')[0]!;
    expect(request.signal?.aborted).toBe(false);
    vm.onHidden();
    expect(request.signal?.aborted).toBe(true);
    await finish(h, first);
    expect(vm.state.body).toEqual({ status: 'loading' });
    expect(h.toasts.messages).toEqual([]);
    await finish(h, vm.onShown());
    expect(vm.state.body.status).toBe('ready');
    expect(h.router.calls(OCT)).toHaveLength(2);
  });

  it('TC-REC-033 REQ-REC-040 게스트 ViewModel은 어떤 API도 부르지 않는다', async () => {
    const h = createRecordHarness({ mode: 'guest', bare: true });
    const vm = h.viewModel;
    await finish(h, vm.onShown());
    await finish(h, vm.applyRoute({ date: '2026-09-17' }));
    await finish(h, vm.onTabReselect());
    await finish(h, vm.selectPreviousMonth());
    await finish(h, vm.retry());
    expect(h.ff.calls).toHaveLength(0);
    expect(vm.state.mode).toBe('guest');
  });
});

describe('RecordViewModel 자정·포그라운드 복귀 (D-19, REQ-REC-003, 007, TC-REC-005~007)', () => {
  it('TC-REC-007 TC-TIME-016 10/31 → 11/1로 월이 바뀐 뒤 처음 열면 11월이 "현재 달"이고 첫 진입 달이 된다', async () => {
    const h = createRecordHarness({ now: '2026-10-31T15:00:00Z', routes: { [NOV]: 'record/posts-calendar__2026-11-empty' } });
    const vm = await open(h);
    expect(vm.state).toMatchObject({ today: '2026-11-01', currentMonth: ym(2026, 11), month: ym(2026, 11) });
    expect(vm.state.availableMonths).toEqual([ym(2026, 11), ym(2026, 10), ym(2026, 9)]);
    expect(h.router.calls(NOV)).toHaveLength(1);
    expect(h.router.calls(OCT)).toHaveLength(0);
  });

  it('TC-REC-007 TC-TIME-016 REQ-REC-007 화면을 벗어났다 월이 바뀐 뒤 돌아오면 현재 달을 다시 계산하되 보던 달과 선택 날짜는 유지한다', async () => {
    const h = createRecordHarness({ now: '2026-10-31T14:00:00Z', routes: { [NOV]: 'record/posts-calendar__2026-11-empty' } });
    const vm = await open(h);
    vm.selectDate('2026-10-20');
    expect(vm.state.currentMonth).toEqual(ym(2026, 10));
    vm.onHidden();
    h.clock.setWallClock(Date.parse('2026-10-31T15:00:00Z'));
    await finish(h, vm.onShown());
    expect(vm.state).toMatchObject({ today: '2026-11-01', currentMonth: ym(2026, 11), month: ym(2026, 10), selectedDate: '2026-10-20' });
    expect(vm.state.availableMonths[0]).toEqual(ym(2026, 11));
    expect(vm.state.canGoNext).toBe(true);
    await finish(h, vm.selectNextMonth());
    expect(vm.state.month).toEqual(ym(2026, 11));
    expect(vm.state.body).toMatchObject({ status: 'ready', posts: [] });
  });

  it('REQ-REC-007 보이는 동안 자정을 지나면(가짜 시계 전진) 같은 규칙으로 현재 달과 선택지를 갱신한다', async () => {
    const h = createRecordHarness({ now: '2026-10-31T14:00:00Z' });
    const vm = await open(h);
    vm.selectDate('2026-10-20');
    await h.clock.advance(3_600_000); // KST 자정
    await settle();
    expect(vm.state).toMatchObject({ today: '2026-11-01', currentMonth: ym(2026, 11), month: ym(2026, 10), selectedDate: '2026-10-20' });
    expect(vm.state.availableMonths).toEqual([ym(2026, 11), ym(2026, 10), ym(2026, 9)]);
  });

  it('TC-REC-005 자정 직전(KST 23:59:59)에는 아직 10월이고 1초 뒤 11월이다', async () => {
    const h = createRecordHarness({ now: '2026-10-31T14:59:59Z' });
    const vm = await open(h);
    expect(vm.state.currentMonth).toEqual(ym(2026, 10));
    await h.clock.advance(1_000);
    await settle();
    expect(vm.state.currentMonth).toEqual(ym(2026, 11));
  });

  it('TC-REC-006 연말 경계: 12/31 KST 23:59:59는 2026-12, 자정 뒤 2027-01이다', async () => {
    const h = createRecordHarness({
      now: '2026-12-31T14:59:59Z',
      routes: { [MONTHS_KEY]: () => json(200, monthsBody([2026, 12], [2026, 11])), [calendarOf(2026, 12)]: monthResponse(2026, 12) },
    });
    const vm = await open(h);
    expect(vm.state.currentMonth).toEqual(ym(2026, 12));
    await h.clock.advance(1_000);
    await settle();
    expect(vm.state.currentMonth).toEqual(ym(2027, 1));
    expect(vm.state.availableMonths[0]).toEqual(ym(2027, 1));
    expect(vm.state.month).toEqual(ym(2026, 12));
  });

  it('REQ-REC-007 onHidden 뒤에는 자정 감시가 멈춘다(예약된 타이머가 남지 않는다)', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    expect(h.clock.pendingTimers).toBeGreaterThan(0);
    vm.onHidden();
    await settle();
    expect(h.clock.pendingTimers).toBe(0);
  });
});

describe('RecordViewModel 월 값 확인', () => {
  it('REQ-REC-017 요청 값은 선택한 연과 월이다(월 값 앞에 0을 붙이지 않는다)', async () => {
    const h = createRecordHarness();
    const vm = await open(h);
    await finish(h, vm.selectPreviousMonth());
    const queries = h.ff.callsTo('GET /posts/calendar').map((c) => Object.fromEntries(c.query));
    expect(queries).toEqual([
      { year: '2026', month: '10' },
      { year: '2026', month: '9' },
    ]);
  });
});
