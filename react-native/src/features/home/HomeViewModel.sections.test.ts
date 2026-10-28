import { KstDate } from '../../core/time/KstDate';
import { createHomeHarness } from './__testing__/createHomeHarness';
import type { HomeState, RankingSection, WeeklySection } from './HomeState';

const POP_TODAY = 'GET /posts?topicDate=2026-10-27&sort=popular&page=1&pageSize=20';
const POP_YEST = 'GET /posts?topicDate=2026-10-26&sort=popular&page=1&pageSize=20';

const weekly = (s: Readonly<HomeState>) => {
  const w: WeeklySection = s.weekly;
  if (w.status !== 'ready') throw new Error(`weekly ${w.status}`);
  return w;
};
const posts = (section: RankingSection) => {
  if (section.status !== 'ready') throw new Error(`ranking ${section.status}`);
  return section.posts;
};
const suffix = (list: readonly { id: string }[]) => list.map((p) => p.id.slice(-2));

describe('HomeViewModel 랭킹·오늘 인기', () => {
  it('TC-HOME-015 REQ-HOME-027 오늘 주제의 topicDate로 sort=popular를 요청하고 서버 순서 그대로 앞 5개만 담는다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    expect(h.router.calls(POP_TODAY)).toHaveLength(1);
    expect(suffix(posts(h.viewModel.getSnapshot().popular))).toEqual([
      '02',
      '03',
      '04',
      '05',
      '06',
    ]);
  });

  it('TC-HOME-016 REQ-HOME-028 어제(KST 10/26) 주제로 같은 방식 조회하고 5개 미만이면 있는 만큼 담는다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    expect(h.router.calls('GET /topics?date=2026-10-26')).toHaveLength(1);
    expect(suffix(posts(h.viewModel.getSnapshot().yesterday))).toEqual(['61', '62', '63']);
    expect(h.viewModel.getSnapshot().yesterdayDate.toString()).toBe('2026-10-26');
  });

  it('TC-HOME-017 REQ-HOME-029 어제 주제 404면 어제 랭킹만 빈 ready, 다른 섹션은 정상이다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /topics?date=2026-10-26', 'home/topics__404-not-found');
    await h.viewModel.onShown();
    const state = h.viewModel.getSnapshot();
    expect(state.yesterday).toEqual({ status: 'ready', posts: [] });
    expect(h.router.calls(POP_YEST)).toHaveLength(0);
    expect(state.popular.status).toBe('ready');
    expect(state.hero.kind).toBe('photo');
  });

  it('REQ-HOME-029 /posts가 404여도 빈 ready다', async () => {
    const h = await createHomeHarness();
    h.router.set(POP_TODAY, 'home/topics__404-not-found');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().popular).toEqual({ status: 'ready', posts: [] });
  });

  it.each([
    ['home/posts-list__popular-0', 0],
    ['home/posts-list__popular-1', 1],
    ['home/posts-list__popular-3', 3],
  ])('TC-HOME-019 %s는 %i개만 담고 깨지지 않는다', async (fixture, count) => {
    const h = await createHomeHarness();
    h.router.set(POP_TODAY, fixture);
    await h.viewModel.onShown();
    expect(posts(h.viewModel.getSnapshot().popular)).toHaveLength(count);
  });

  it('TC-HOME-020 REQ-HOME-030 랭킹만 실패하면 그 섹션만 error, 히어로·주간·배너는 유지된다', async () => {
    const h = await createHomeHarness();
    h.router.set(POP_YEST, 'home/posts-list__500-server-error');
    await h.viewModel.onShown();
    const state = h.viewModel.getSnapshot();
    expect(state.yesterday).toEqual({ status: 'error' });
    expect(state.popular.status).toBe('ready');
    expect(state.hero.kind).toBe('photo');
    expect(state.weekly.status).toBe('ready');
    expect(h.bannerFeed.getSnapshot().status).toBe('ready');
  });

  it('TC-HOME-020 retryRanking은 그 섹션만 다시 요청한다', async () => {
    const h = await createHomeHarness();
    h.router.set(POP_YEST, 'home/posts-list__500-server-error');
    await h.viewModel.onShown();
    h.router.set(POP_YEST, 'home/posts-list__popular-3');
    const before = h.transport.requests.length;
    await h.viewModel.retryRanking('yesterday');
    expect(h.viewModel.getSnapshot().yesterday.status).toBe('ready');
    expect(h.transport.requests.length - before).toBeLessThanOrEqual(2); // topics + posts만
  });

  it('TC-HOME-021 REQ-HOME-032 랭킹 사진을 누르면 목록 항목을 시드로 게시물 상세로 간다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    const item = posts(h.viewModel.getSnapshot().popular)[1];
    h.viewModel.onRankingItemPress('popular', item.id);
    expect(h.navigator.calls).toEqual([{ type: 'post-detail', postId: item.id, seed: item }]);
  });

  it('TC-HOME-023 REQ-HOME-031 더 보기는 해당 섹션 날짜(어제/오늘)의 전시 인기순을 연다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    h.viewModel.onRankingMorePress('yesterday');
    h.viewModel.onRankingMorePress('popular');
    expect(h.navigator.calls).toEqual([
      { type: 'display-popular', date: '2026-10-26' },
      { type: 'display-popular', date: '2026-10-27' },
    ]);
  });
});

describe('HomeViewModel 랭킹 좋아요 위임 (D-04)', () => {
  it('REQ-HOME-033 하트는 현재 표시 값을 LikeController.toggle에 위임하고 요청은 직접 보내지 않는다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    const before = h.transport.requests.length;
    const item = posts(h.viewModel.getSnapshot().popular)[0];
    h.viewModel.onRankingLikePress('popular', item.id);
    expect(h.likes.toggled).toEqual([
      { postId: item.id, likeCount: item.likeCount, isLiked: item.isLiked },
    ]);
    expect(h.transport.requests).toHaveLength(before);
    expect(h.toast.messages).toEqual([]);
  });

  it('REQ-HOME-033 컨트롤러가 알려 준 값(낙관 갱신·롤백)을 목록에 반영한다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    const item = posts(h.viewModel.getSnapshot().popular)[0];

    h.likes.emit({
      kind: 'updated',
      snapshot: { postId: item.id, likeCount: item.likeCount + 1, isLiked: true },
    });
    expect(posts(h.viewModel.getSnapshot().popular)[0]).toMatchObject({
      likeCount: item.likeCount + 1,
      isLiked: true,
    });

    h.likes.emit({
      kind: 'updated',
      snapshot: { postId: item.id, likeCount: item.likeCount, isLiked: false },
    });
    expect(posts(h.viewModel.getSnapshot().popular)[0]).toMatchObject({
      likeCount: item.likeCount,
      isLiked: false,
    });
  });

  it('REQ-HOME-033 같은 게시물이 어제·오늘 목록에 모두 있으면 둘 다 갱신한다', async () => {
    const h = await createHomeHarness();
    h.router.set(POP_YEST, 'home/posts-list__popular-5');
    await h.viewModel.onShown();
    const item = posts(h.viewModel.getSnapshot().popular)[0];
    h.likes.emit({
      kind: 'updated',
      snapshot: { postId: item.id, likeCount: 99, isLiked: true },
    });
    expect(posts(h.viewModel.getSnapshot().popular)[0].likeCount).toBe(99);
    expect(posts(h.viewModel.getSnapshot().yesterday)[0].likeCount).toBe(99);
  });

  it('D-04 404(removed)면 목록에서 뺀다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    const item = posts(h.viewModel.getSnapshot().popular)[0];
    h.likes.emit({ kind: 'removed', postId: item.id });
    expect(posts(h.viewModel.getSnapshot().popular).map((p) => p.id)).not.toContain(item.id);
  });

  it('D-04 다른 화면에서 바뀐 값은 홈이 다시 보일 때(재조회 응답 위에) 컨트롤러 값으로 덮어 그린다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    const item = posts(h.viewModel.getSnapshot().popular)[0];
    h.likes.seed({ postId: item.id, likeCount: 77, isLiked: true });
    await h.viewModel.onShown();
    expect(posts(h.viewModel.getSnapshot().popular)[0]).toMatchObject({
      likeCount: 77,
      isLiked: true,
    });
  });

  it('홈이 안 보이면 좋아요 알림 구독을 해제한다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    expect(h.likes.listenerCount).toBe(1);
    h.viewModel.onHidden();
    expect(h.likes.listenerCount).toBe(0);
  });
});

describe('HomeViewModel 이번 주 기록', () => {
  it('TC-HOME-024 REQ-HOME-019 오늘 10/27(화)의 주는 일요일 10/25부터 토요일 10/31 7칸이다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    const w = weekly(h.viewModel.getSnapshot());
    expect(w.days.map((d) => d.date.toString())).toEqual([
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
    ]);
    expect(w.days.map((d) => d.date.dayOfWeek())).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('TC-HOME-030 REQ-HOME-021 기록이 있는 칸만 entry를 갖고 count는 그 수(N/7)다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    const w = weekly(h.viewModel.getSnapshot());
    expect(w.count).toBe(3);
    expect(w.days.map((d) => d.entry?.postId.slice(-2) ?? null)).toEqual([
      '93',
      '94',
      '01',
      null,
      null,
      null,
      null,
    ]);
  });

  it('TC-HOME-030 PENDING 칸도 entry를 갖고 status가 PENDING이다', async () => {
    const h = await createHomeHarness();
    h.router.set(
      'GET /posts/calendar?year=2026&month=10',
      'home/posts-calendar__2026-10-week-pending',
    );
    await h.viewModel.onShown();
    const w = weekly(h.viewModel.getSnapshot());
    expect(w.days[2].entry?.status).toBe('PENDING');
    expect(w.count).toBe(2);
  });

  it.each([
    ['2026-11-01T03:00:00Z', ['2026-11-01', '2026-11-07'], ['2026-11']],
    ['2026-10-31T03:00:00Z', ['2026-10-25', '2026-10-31'], ['2026-10']],
  ])('TC-HOME-025 오늘 %s: 주는 %j이고 조회 월은 %j', async (now, [first, last], months) => {
    const h = await createHomeHarness({ now });
    for (const ym of ['2026-10', '2026-11']) {
      h.router.set(
        `GET /posts/calendar?year=2026&month=${Number(ym.slice(5))}`,
        ym === '2026-10'
          ? 'home/posts-calendar__2026-10-empty'
          : 'home/posts-calendar__2026-11-empty',
      );
    }
    stubTopicsFor(h);
    await h.viewModel.onShown();
    const w = weekly(h.viewModel.getSnapshot());
    expect([w.days[0].date.toString(), w.days[6].date.toString()]).toEqual([first, last]);
    const requested = h.transport.requestsTo('GET', '/posts/calendar').map((r) => {
      const q = new URL(r.url).searchParams;
      return `${q.get('year')}-${String(q.get('month')).padStart(2, '0')}`;
    });
    expect(requested).toEqual(months);
  });

  it('TC-HOME-026 REQ-HOME-020 9/30(수)은 9월과 10월을 모두 요청해 합친다(월 경계)', async () => {
    const h = await createHomeHarness({ now: '2026-09-30T03:00:00Z' });
    h.router.set('GET /posts/calendar?year=2026&month=9', 'home/posts-calendar__2026-09-week');
    h.router.set('GET /posts/calendar?year=2026&month=10', 'home/posts-calendar__2026-10-empty');
    stubTopicsFor(h);
    await h.viewModel.onShown();
    const w = weekly(h.viewModel.getSnapshot());
    expect(w.days.map((d) => d.date.toString())).toEqual([
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
    expect(w.days.filter((d) => d.entry).map((d) => d.date.toString())).toEqual([
      '2026-09-29',
      '2026-09-30',
    ]);
    expect(h.transport.requestsTo('GET', '/posts/calendar')).toHaveLength(2);
  });

  it('TC-HOME-027 12/31(목)은 2026-12와 2027-01을 조회하고 칸 순서가 맞다(연말 경계)', async () => {
    const h = await createHomeHarness({ now: '2026-12-31T03:00:00Z' });
    h.router.set('GET /posts/calendar?year=2026&month=12', 'home/posts-calendar__2026-12-week');
    h.router.set('GET /posts/calendar?year=2027&month=1', 'home/posts-calendar__2027-01-empty');
    stubTopicsFor(h);
    await h.viewModel.onShown();
    const w = weekly(h.viewModel.getSnapshot());
    expect(w.days.map((d) => d.date.toString())).toEqual([
      '2026-12-27',
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
    expect(w.count).toBe(2);
  });

  it('TC-HOME-028 윤년 2028-02-29(화)는 2/27~3/4이고 2028-02·2028-03을 조회한다', async () => {
    const h = await createHomeHarness({ now: '2028-02-29T03:00:00Z' });
    h.router.set('GET /posts/calendar?year=2028&month=2', 'home/posts-calendar__2026-10-empty');
    h.router.set('GET /posts/calendar?year=2028&month=3', 'home/posts-calendar__2026-10-empty');
    stubTopicsFor(h);
    await h.viewModel.onShown();
    const w = weekly(h.viewModel.getSnapshot());
    expect([w.days[0].date.toString(), w.days[6].date.toString()]).toEqual([
      '2028-02-27',
      '2028-03-04',
    ]);
    expect(h.router.calls('GET /posts/calendar?year=2028&month=2')).toHaveLength(1);
    expect(h.router.calls('GET /posts/calendar?year=2028&month=3')).toHaveLength(1);
  });

  it('TC-HOME-033 한 달만 실패하면 부분 표시 없이 error이고, 다시 시도하면 두 달을 모두 다시 요청한다', async () => {
    const h = await createHomeHarness({ now: '2026-09-30T03:00:00Z' });
    h.router.set('GET /posts/calendar?year=2026&month=9', 'home/posts-calendar__2026-09-week');
    h.router.set('GET /posts/calendar?year=2026&month=10', 'home/posts-calendar__500-server-error');
    stubTopicsFor(h);
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().weekly).toEqual({ status: 'error' });

    h.router.set('GET /posts/calendar?year=2026&month=9', 'home/posts-calendar__2026-09-week');
    h.router.set('GET /posts/calendar?year=2026&month=10', 'home/posts-calendar__2026-10-empty');
    await h.viewModel.retryWeekly();
    expect(h.router.calls('GET /posts/calendar?year=2026&month=9')).toHaveLength(1);
    expect(h.router.calls('GET /posts/calendar?year=2026&month=10')).toHaveLength(1);
    expect(weekly(h.viewModel.getSnapshot()).count).toBe(2);
  });

  it('TC-HOME-032 REQ-HOME-025 주간 조회 실패는 그 섹션만 error이고 retryWeekly는 주간만 다시 부른다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/calendar?year=2026&month=10', 'home/posts-calendar__500-server-error');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().weekly).toEqual({ status: 'error' });
    expect(h.viewModel.getSnapshot().popular.status).toBe('ready');

    h.router.set(
      'GET /posts/calendar?year=2026&month=10',
      'home/posts-calendar__2026-10-week-approved',
    );
    const before = h.transport.requests.length;
    await h.viewModel.retryWeekly();
    expect(h.transport.requests.length - before).toBe(1);
    expect(h.viewModel.getSnapshot().weekly.status).toBe('ready');
  });

  it('TC-HOME-031 REQ-HOME-023 기록이 있는 칸을 누르면 기록 탭이 그 날짜 선택으로 열리고, 없는 칸은 아무 일도 없다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    h.viewModel.onWeekDayPress(KstDate.of(2026, 10, 26));
    h.viewModel.onWeekDayPress(KstDate.of(2026, 10, 29));
    expect(h.navigator.calls).toEqual([{ type: 'record', selectedDate: '2026-10-26' }]);
  });

  it('REQ-HOME-024 보러가기는 선택 날짜 없이 기록 탭을 연다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    h.viewModel.onWeeklyMorePress();
    expect(h.navigator.calls).toEqual([{ type: 'record', selectedDate: null }]);
  });

  it('TC-HOME-029 기기 시간대와 무관하게 KST 자정(10/26 15:00Z)은 10/27 화요일이다', async () => {
    const h = await createHomeHarness({ now: '2026-10-26T15:00:00Z' });
    await h.viewModel.onShown();
    const state = h.viewModel.getSnapshot();
    expect(state.todayDate.toString()).toBe('2026-10-27');
    expect(state.todayDate.dayOfWeek()).toBe(2);
    expect(h.router.calls('GET /topics?date=2026-10-27')).toHaveLength(1);
  });

  it('TC-HOME-034 REQ-HOME-001 응답을 기다리지 않고 주제·어제 주제·히어로·주간·배너·미읽음 요청이 모두 시작된다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /topics?date=2026-10-27', () => new Promise(() => {}));
    h.router.set('GET /topics?date=2026-10-26', () => new Promise(() => {}));
    h.router.set('GET /posts/today', () => new Promise(() => {}));
    h.router.set('GET /posts/calendar?year=2026&month=10', () => new Promise(() => {}));
    h.router.set('GET /banners?page=1&pageSize=10', () => new Promise(() => {}));
    h.router.set('GET /notifications/unread-status', () => new Promise(() => {}));
    void h.viewModel.onShown();
    await new Promise((resolve) => setImmediate(resolve));

    const started = h.transport.requests.map((r) => new URL(r.url).pathname.replace('/api/v1', ''));
    expect(started.sort()).toEqual(
      [
        '/banners',
        '/notifications/unread-status',
        '/posts/calendar',
        '/posts/today',
        '/topics',
        '/topics',
      ].sort(),
    );
  });
});

// 임의 날짜에서도 /topics 요청이 라우트에 막히지 않게 모든 날짜를 404 주제 없음으로 둔다.
function stubTopicsFor(h: Awaited<ReturnType<typeof createHomeHarness>>): void {
  const today = h.viewModel.getSnapshot().todayDate;
  const yesterday = h.viewModel.getSnapshot().yesterdayDate;
  for (const date of [today, yesterday]) {
    h.router.set(`GET /topics?date=${date.toString()}`, 'home/topics__404-not-found');
  }
}
