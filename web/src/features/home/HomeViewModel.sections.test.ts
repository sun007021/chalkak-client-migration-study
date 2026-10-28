import { t } from '../../copy/ko';
import { CALENDAR_OCT, POPULAR_TODAY, POPULAR_YESTERDAY, TODAY_POST, TOPICS_YESTERDAY, UNREAD, createHomeHarness, finish, settle } from '../../test/homeHarness';
import type { HomeHarness } from '../../test/homeHarness';
import type { HomeState, RankingSection, WeeklySection } from './HomeViewModel';

const weekly = (s: HomeState): Extract<WeeklySection, { status: 'ready' }> => {
  if (s.weekly.status !== 'ready') throw new Error(`weekly ${s.weekly.status}`);
  return s.weekly;
};
const posts = (section: RankingSection) => {
  if (section.status !== 'ready') throw new Error(`ranking ${section.status}`);
  return section.posts;
};
const suffix = (list: { id: string }[]) => list.map((p) => p.id.slice(-2));

/** 임의 날짜에서도 /topics 요청이 라우트에 막히지 않게 오늘·어제를 모두 "주제 없음"으로 둔다. */
function stubTopics(h: HomeHarness, dates: string[]): void {
  for (const date of dates) h.router.set(`GET /topics?date=${date}`, 'home/topics__404-not-found');
}

describe('HomeViewModel 랭킹·오늘 인기', () => {
  it('TC-HOME-015 REQ-HOME-027 오늘 주제의 topicDate로 sort=popular를 요청하고 서버 순서 그대로 앞 5개만 담는다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    expect(h.router.calls(POPULAR_TODAY)).toHaveLength(1);
    expect(suffix(posts(h.viewModel.state.popular))).toEqual(['02', '03', '04', '05', '06']);
  });

  it('TC-HOME-016 REQ-HOME-028 어제(KST 10/26) 주제로 같은 방식 조회하고 5개 미만이면 있는 만큼 담는다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    expect(h.router.calls(TOPICS_YESTERDAY)).toHaveLength(1);
    expect(h.router.calls(POPULAR_YESTERDAY)).toHaveLength(1);
    expect(suffix(posts(h.viewModel.state.yesterday))).toEqual(['61', '62', '63']);
    expect(h.viewModel.state.yesterdayDate).toBe('2026-10-26');
  });

  it('TC-HOME-017 REQ-HOME-029 어제 주제 404면 어제 랭킹만 빈 ready, 다른 섹션은 정상이다', async () => {
    const h = createHomeHarness();
    h.router.set(TOPICS_YESTERDAY, 'home/topics__404-not-found');
    await finish(h, h.viewModel.onShown());
    const state = h.viewModel.state;
    expect(state.yesterday).toEqual({ status: 'ready', posts: [] });
    expect(h.router.calls(POPULAR_YESTERDAY)).toHaveLength(0);
    expect(state.popular.status).toBe('ready');
    expect(state.hero.kind).toBe('photo');
  });

  it('REQ-HOME-029 /posts가 404여도 빈 ready다', async () => {
    const h = createHomeHarness();
    h.router.set(POPULAR_TODAY, 'home/topics__404-not-found');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.popular).toEqual({ status: 'ready', posts: [] });
  });

  it.each([
    ['home/posts-list__popular-0', 0],
    ['home/posts-list__popular-1', 1],
    ['home/posts-list__popular-3', 3],
  ])('TC-HOME-019 %s는 %i개만 담고 깨지지 않는다', async (fixture, count) => {
    const h = createHomeHarness();
    h.router.set(POPULAR_TODAY, fixture);
    await finish(h, h.viewModel.onShown());
    expect(posts(h.viewModel.state.popular)).toHaveLength(count);
  });

  it('TC-HOME-020 REQ-HOME-030 랭킹만 실패하면 그 섹션만 error, 히어로·주간·배너는 유지된다', async () => {
    const h = createHomeHarness();
    h.router.set(POPULAR_YESTERDAY, 'home/posts-list__500-server-error');
    await finish(h, h.viewModel.onShown());
    const state = h.viewModel.state;
    expect(state.yesterday).toEqual({ status: 'error' });
    expect(state.popular.status).toBe('ready');
    expect(state.hero.kind).toBe('photo');
    expect(state.weekly.status).toBe('ready');
    expect(h.banners.state.status).toBe('ready');
  });

  it('TC-HOME-020 retryRanking은 그 섹션만 다시 요청한다(주제 + 목록 2건)', async () => {
    const h = createHomeHarness();
    h.router.set(POPULAR_YESTERDAY, 'home/posts-list__500-server-error');
    await finish(h, h.viewModel.onShown());
    h.router.set(POPULAR_YESTERDAY, 'home/posts-list__popular-3');
    const before = h.ff.calls.length;
    await finish(h, h.viewModel.retryRanking('yesterday'));
    expect(h.viewModel.state.yesterday.status).toBe('ready');
    expect(h.ff.calls.length - before).toBeLessThanOrEqual(2);
    expect(h.ff.calls.slice(before).map((c) => c.path).sort()).toEqual(['/posts', '/topics']);
  });

  it('retryRanking("popular")은 주제가 이미 보이면 주제를 다시 받지 않고 그 주제로 오늘 인기만 다시 받는다', async () => {
    const h = createHomeHarness();
    h.router.set(POPULAR_TODAY, 'home/posts-list__500-server-error');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.popular.status).toBe('error');

    h.router.set(POPULAR_TODAY, 'home/posts-list__popular-8');
    h.router.set('GET /topics?date=2026-10-27', 'home/topics__404-not-found'); // 다시 받았다면 어긋났을 응답
    await finish(h, h.viewModel.retryRanking('popular'));

    expect(h.router.calls('GET /topics?date=2026-10-27')).toHaveLength(0);
    expect(h.viewModel.state.topic).toMatchObject({ status: 'ready', topic: { title: '가을 하늘' } });
    expect(h.viewModel.state.popular.status).toBe('ready');
  });

  it('retryRanking("popular")은 주제가 오류 상태였다면 주제부터 함께 다시 받는다', async () => {
    const h = createHomeHarness();
    h.router.set('GET /topics?date=2026-10-27', 'home/posts-list__500-server-error');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state).toMatchObject({ topic: { status: 'error' }, popular: { status: 'error' } });
    h.router.set('GET /topics?date=2026-10-27', 'home/topics__open-2026-10-27');
    await finish(h, h.viewModel.retryRanking('popular'));
    expect(h.viewModel.state.topic.status).toBe('ready');
    expect(h.viewModel.state.popular.status).toBe('ready');
  });

  it('TC-HOME-021 REQ-HOME-032 랭킹 사진을 누르면 목록 항목을 시드로 게시물 상세로 간다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    const item = posts(h.viewModel.state.popular)[1]!;
    h.viewModel.onRankingItemPress('popular', item.id);
    expect(h.navigator.calls).toEqual([{ type: 'post-detail', postId: item.id, seed: item }]);
    expect(h.ff.calls.some((c) => c.path === `/posts/${item.id}`)).toBe(false); // 상세 API는 상세 화면에서만
  });

  it('TC-HOME-023 REQ-HOME-031 더 보기는 해당 섹션 날짜(어제/오늘)의 전시 인기순을 연다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    h.viewModel.onRankingMorePress('yesterday');
    h.viewModel.onRankingMorePress('popular');
    expect(h.navigator.calls).toEqual([
      { type: 'display-popular', date: '2026-10-26' },
      { type: 'display-popular', date: '2026-10-27' },
    ]);
  });
});

describe('HomeViewModel 이번 주 기록', () => {
  it('TC-HOME-024 REQ-HOME-019 오늘 10/27(화)의 주는 일요일 10/25부터 토요일 10/31 7칸이다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    expect(weekly(h.viewModel.state).days.map((d) => d.date)).toEqual(['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
  });

  it('TC-HOME-030 REQ-HOME-021 기록이 있는 칸만 entry를 갖고 count는 그 수(N/7)다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    const w = weekly(h.viewModel.state);
    expect(w.count).toBe(3);
    expect(w.days.map((d) => d.entry?.postId.slice(-2) ?? null)).toEqual(['93', '94', '01', null, null, null, null]);
  });

  it('TC-HOME-030 REQ-HOME-022 PENDING 칸도 entry를 갖고 status가 PENDING이다', async () => {
    const h = createHomeHarness();
    h.router.set(CALENDAR_OCT, 'home/posts-calendar__2026-10-week-pending');
    await finish(h, h.viewModel.onShown());
    const w = weekly(h.viewModel.state);
    expect(w.days[2]!.entry?.status).toBe('PENDING');
    expect(w.count).toBe(2);
  });

  it.each([
    ['2026-11-01T03:00:00Z', ['2026-11-01', '2026-11-07'], [[2026, 11]]],
    ['2026-10-31T03:00:00Z', ['2026-10-25', '2026-10-31'], [[2026, 10]]],
  ])('TC-HOME-025 오늘 %s: 주는 %j이고 조회 월은 %j', async (now, [first, last], months) => {
    const h = createHomeHarness({ now });
    h.router.set('GET /posts/calendar?year=2026&month=10', 'home/posts-calendar__2026-10-empty');
    h.router.set('GET /posts/calendar?year=2026&month=11', 'home/posts-calendar__2026-11-empty');
    stubTopics(h, ['2026-10-30', '2026-10-31', '2026-11-01']);
    await finish(h, h.viewModel.onShown());
    const w = weekly(h.viewModel.state);
    expect([w.days[0]!.date, w.days[6]!.date]).toEqual([first, last]);
    const requested = h.ff.callsTo('GET /posts/calendar').map((c) => [Number(c.query.get('year')), Number(c.query.get('month'))]);
    expect(requested).toEqual(months);
  });

  it('TC-HOME-026 REQ-HOME-020 9/30(수)은 9월과 10월을 모두 요청해 합친다(월 경계)', async () => {
    const h = createHomeHarness({ now: '2026-09-30T03:00:00Z' });
    h.router.set('GET /posts/calendar?year=2026&month=9', 'home/posts-calendar__2026-09-week');
    h.router.set('GET /posts/calendar?year=2026&month=10', 'home/posts-calendar__2026-10-empty');
    stubTopics(h, ['2026-09-29', '2026-09-30']);
    await finish(h, h.viewModel.onShown());
    const w = weekly(h.viewModel.state);
    expect(w.days.map((d) => d.date)).toEqual(['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(w.days.filter((d) => d.entry).map((d) => d.date)).toEqual(['2026-09-29', '2026-09-30']);
    expect(h.ff.callsTo('GET /posts/calendar')).toHaveLength(2);
  });

  it('TC-HOME-027 12/31(목)은 2026-12와 2027-01을 조회하고 칸 순서가 맞다(연말 경계)', async () => {
    const h = createHomeHarness({ now: '2026-12-31T03:00:00Z' });
    h.router.set('GET /posts/calendar?year=2026&month=12', 'home/posts-calendar__2026-12-week');
    h.router.set('GET /posts/calendar?year=2027&month=1', 'home/posts-calendar__2027-01-empty');
    stubTopics(h, ['2026-12-30', '2026-12-31']);
    await finish(h, h.viewModel.onShown());
    const w = weekly(h.viewModel.state);
    expect(w.days.map((d) => d.date)).toEqual(['2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    expect(w.count).toBe(2);
  });

  it('TC-HOME-028 윤년 2028-02-29(화)는 2/27~3/4이고 2028-02·2028-03을 조회한다', async () => {
    const h = createHomeHarness({ now: '2028-02-29T03:00:00Z' });
    h.router.set('GET /posts/calendar?year=2028&month=2', 'home/posts-calendar__2026-10-empty');
    h.router.set('GET /posts/calendar?year=2028&month=3', 'home/posts-calendar__2026-10-empty');
    stubTopics(h, ['2028-02-28', '2028-02-29']);
    await finish(h, h.viewModel.onShown());
    const w = weekly(h.viewModel.state);
    expect([w.days[0]!.date, w.days[6]!.date]).toEqual(['2028-02-27', '2028-03-04']);
    expect(h.router.calls('GET /posts/calendar?year=2028&month=2')).toHaveLength(1);
    expect(h.router.calls('GET /posts/calendar?year=2028&month=3')).toHaveLength(1);
  });

  it('TC-HOME-033 한 달만 실패하면 부분 표시 없이 error이고, 다시 시도하면 두 달을 모두 다시 요청한다(임시 동작)', async () => {
    const h = createHomeHarness({ now: '2026-09-30T03:00:00Z' });
    h.router.set('GET /posts/calendar?year=2026&month=9', 'home/posts-calendar__2026-09-week');
    h.router.set('GET /posts/calendar?year=2026&month=10', 'home/posts-calendar__500-server-error');
    stubTopics(h, ['2026-09-29', '2026-09-30']);
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.weekly).toEqual({ status: 'error' });

    h.router.set('GET /posts/calendar?year=2026&month=9', 'home/posts-calendar__2026-09-week');
    h.router.set('GET /posts/calendar?year=2026&month=10', 'home/posts-calendar__2026-10-empty');
    await finish(h, h.viewModel.retryWeekly());
    expect(h.router.calls('GET /posts/calendar?year=2026&month=9')).toHaveLength(1);
    expect(h.router.calls('GET /posts/calendar?year=2026&month=10')).toHaveLength(1);
    expect(weekly(h.viewModel.state).count).toBe(2);
  });

  it('TC-HOME-032 REQ-HOME-025 주간 조회 실패는 그 섹션만 error이고 retryWeekly는 주간만 다시 부른다', async () => {
    const h = createHomeHarness();
    h.router.set(CALENDAR_OCT, 'home/posts-calendar__500-server-error');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.weekly).toEqual({ status: 'error' });
    expect(h.viewModel.state.popular.status).toBe('ready');

    h.router.set(CALENDAR_OCT, 'home/posts-calendar__2026-10-week-approved');
    const before = h.ff.calls.length;
    await finish(h, h.viewModel.retryWeekly());
    expect(h.ff.calls.length - before).toBe(1);
    expect(h.viewModel.state.weekly.status).toBe('ready');
  });

  it('TC-HOME-031 REQ-HOME-023 기록이 있는 칸을 누르면 기록 탭이 그 날짜 선택으로 열리고, 없는 칸은 아무 일도 없다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    h.viewModel.onWeekDayPress('2026-10-26');
    h.viewModel.onWeekDayPress('2026-10-29');
    expect(h.navigator.calls).toEqual([{ type: 'record', selectedDate: '2026-10-26' }]);
  });

  it('TC-HOME-031 PENDING 칸도 기록이 있으므로 누르면 기록 탭으로 간다(임시: Android의 post != null 규칙)', async () => {
    const h = createHomeHarness();
    h.router.set(CALENDAR_OCT, 'home/posts-calendar__2026-10-week-pending');
    await finish(h, h.viewModel.onShown());
    h.viewModel.onWeekDayPress('2026-10-27');
    expect(h.navigator.calls).toEqual([{ type: 'record', selectedDate: '2026-10-27' }]);
  });

  it('REQ-HOME-024 보러가기는 선택 날짜 없이 기록 탭을 연다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    h.viewModel.onWeeklyMorePress();
    expect(h.navigator.calls).toEqual([{ type: 'record', selectedDate: null }]);
  });

  it('보러가기: 게스트는 기록 탭을 열 수 없어 이동하지 않고 기록 제한 토스트를 띄운다(임시: REQ-NAV-013을 따름)', async () => {
    const h = createHomeHarness({ mode: 'guest' });
    await finish(h, h.viewModel.onShown());
    h.viewModel.onWeeklyMorePress();
    expect(h.navigator.calls).toEqual([]);
    expect(h.toasts.messages).toEqual([t('nav.guest.record')]);
  });

  it('TC-HOME-029 REQ-HOME-003 KST 자정(UTC 10/26 15:00Z)은 10/27 화요일이다: 요청 날짜도 KST', async () => {
    const h = createHomeHarness({ now: '2026-10-26T15:00:00Z' });
    await finish(h, h.viewModel.onShown());
    const state = h.viewModel.state;
    expect(state.todayDate).toBe('2026-10-27');
    expect(state.yesterdayDate).toBe('2026-10-26');
    expect(weekly(state).days[2]!.date).toBe('2026-10-27');
    expect(h.router.calls('GET /topics?date=2026-10-27')).toHaveLength(1);
  });

  it('TC-HOME-034 REQ-HOME-001 응답을 기다리지 않고 주제·어제 주제·히어로·주간·배너·미읽음 요청이 모두 동시에 시작된다', async () => {
    const h = createHomeHarness();
    const never = () => new Promise<Response>(() => {});
    for (const key of ['GET /topics?date=2026-10-27', TOPICS_YESTERDAY, TODAY_POST, CALENDAR_OCT, 'GET /banners?page=1&pageSize=10', UNREAD]) h.router.set(key, never);
    void h.viewModel.onShown();
    await settle();

    expect(h.ff.calls.map((c) => c.path).sort()).toEqual(['/banners', '/notifications/unread-status', '/posts/calendar', '/posts/today', '/topics', '/topics']);
  });
});
