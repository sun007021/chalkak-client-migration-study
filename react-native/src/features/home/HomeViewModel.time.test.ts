import { createHomeHarness, MY_POST_ID, routeNextDay } from './__testing__/createHomeHarness';

const POP = (date: string) => `GET /posts?topicDate=${date}&sort=popular&page=1&pageSize=20`;

describe('HomeViewModel 시간 규약 (common-infra TIME)', () => {
  it('TC-TIME-018 참여 기간이 자정을 넘어 이어지면 GET /posts/today 응답의 topicDate(10/27)를 그대로 쓰고 오늘(10/28)로 덮어쓰지 않는다', async () => {
    // now = KST 10/28 01:00. 서버는 아직 10/27 주제의 참여 기간이라고 답한다.
    const h = await createHomeHarness({ now: '2026-10-27T16:00:00Z' });
    h.router
      .set('GET /topics?date=2026-10-28', 'home/topics__open-2026-10-28')
      .set(POP('2026-10-28'), 'home/posts-list__popular-5')
      .set('GET /posts/today', 'time/posts-today__cross-midnight');

    await h.viewModel.onShown();

    const state = h.viewModel.getSnapshot();
    expect(state.todayDate.toString()).toBe('2026-10-28'); // 홈의 KST 오늘
    expect(state.hero).toEqual({ kind: 'empty', banned: false }); // 서버 응답을 그대로 반영
    expect(h.router.calls('GET /posts/today')).toHaveLength(1);
    // 오늘 주제로 보내는 질의에 클라이언트가 오늘 날짜를 끼워 넣지 않는다(응답 topicDate가 기준)
    const [request] = h.router.calls('GET /posts/today');
    expect(new URL(request.url).search).toBe('');
  });

  it('TC-TIME-018 응답 topicDate가 어제(10/27)인 사진은 AI 리뷰 카드 대상이 아니다(오늘 주제일 때만 대상)', async () => {
    const crossed = await createHomeHarness({ now: '2026-10-27T16:00:00Z' });
    crossed.router
      .set('GET /topics?date=2026-10-28', 'home/topics__open-2026-10-28')
      .set(POP('2026-10-28'), 'home/posts-list__popular-5');
    await crossed.viewModel.onShown();
    expect(crossed.viewModel.getSnapshot().hero).toMatchObject({ kind: 'photo' });
    expect(crossed.viewModel.getSnapshot().aiCardPostId).toBeNull();

    const sameDay = await createHomeHarness();
    await sameDay.viewModel.onShown();
    expect(sameDay.viewModel.getSnapshot().aiCardPostId).toBe(MY_POST_ID);
  });

  it('TC-TIME-020 인접한 두 주제의 경계 시각(A.end == B.start)에는 서버가 준 B(OPEN)를 표시하고 어제 랭킹은 A(CLOSED) 날짜를 쓴다', async () => {
    // now = 2026-10-26T15:00:00Z = KST 10/27 00:00 = A.endsAt = B.startsAt
    const h = await createHomeHarness({ now: '2026-10-26T15:00:00Z' });
    h.router
      .set('GET /topics?date=2026-10-27', 'time/topics__open')
      .set('GET /topics?date=2026-10-26', 'time/topics__closed')
      .set('GET /posts/today', 'time/posts-today__adjacent-topic');

    await h.viewModel.onShown();

    const state = h.viewModel.getSnapshot();
    expect(state.todayDate.toString()).toBe('2026-10-27');
    expect(state.topic).toMatchObject({
      status: 'ready',
      topic: { title: '가을 하늘', phase: 'OPEN' },
    });
    expect(state.yesterdayDate.toString()).toBe('2026-10-26');
    expect(h.router.calls('GET /topics?date=2026-10-27')).toHaveLength(1);
  });

  it('TC-TIME-021 주제가 없는 시간대(GET /posts/today 404)는 NoOpenTopic 상태로 표시한다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/today', 'time/posts-today__no-topic');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().hero).toEqual({ kind: 'no-open-topic' });
  });

  it('TC-TIME-006 홈의 주제·랭킹 요청은 KST 오늘 날짜를 쿼리로 쓴다(UTC로는 아직 10/26이어도)', async () => {
    const h = await createHomeHarness({ now: '2026-10-26T15:00:00Z' });
    h.router.set('GET /topics?date=2026-10-27', 'time/topics__open');
    h.router.set('GET /topics?date=2026-10-26', 'time/topics__closed');
    await h.viewModel.onShown();
    const dates = h.transport.requests
      .map((r) => new URL(r.url))
      .filter((u) => u.pathname.endsWith('/topics'))
      .map((u) => u.searchParams.get('date'));
    expect(dates.sort()).toEqual(['2026-10-26', '2026-10-27']);
    const topicDates = h.transport.requests
      .map((r) => new URL(r.url))
      .filter((u) => u.pathname.endsWith('/posts') && u.searchParams.has('topicDate'))
      .map((u) => u.searchParams.get('topicDate'));
    expect(topicDates.sort()).toEqual(['2026-10-26', '2026-10-27']);
  });

  // KST 10/27 23:59:59 = 14:59:59Z. 자정(10/28 00:00:00 KST)까지 1초.
  describe('홈이 보이는 중 KST 자정 (REQ-TIME-007)', () => {
    const BEFORE_MIDNIGHT = '2026-10-27T14:59:59Z';
    const SECOND = 1000;

    it('TC-TIME-014 23:59:59에는 그대로이고 00:00:00을 넘기면 홈이 전체를 다시 불러와 오늘 주제·주간 기록이 10/28 기준이 된다', async () => {
      const h = await createHomeHarness({ now: BEFORE_MIDNIGHT });
      await h.viewModel.onShown();
      routeNextDay(h);

      await h.midnightSleeper.advance(SECOND - 1); // 23:59:59.999
      expect(h.viewModel.getSnapshot().todayDate.toString()).toBe('2026-10-27');
      expect(h.router.calls('GET /topics?date=2026-10-28')).toHaveLength(0);

      await h.midnightSleeper.advance(1); // 00:00:00.000
      const state = h.viewModel.getSnapshot();
      expect(state.todayDate.toString()).toBe('2026-10-28');
      expect(state.yesterdayDate.toString()).toBe('2026-10-27');
      expect(state.topic).toMatchObject({ status: 'ready', topic: { title: '골목길' } });
      expect(state.weekly.status).toBe('ready');
      expect(h.router.calls('GET /topics?date=2026-10-28')).toHaveLength(1);
      expect(h.router.calls('GET /posts/today')).toHaveLength(2); // 최초 + 자정 재로드
      expect(h.router.calls('GET /posts/calendar?year=2026&month=10')).toHaveLength(1); // routeNextDay 이후 호출만 센다
      expect(h.router.calls('GET /topics?date=2026-10-27')).toHaveLength(1); // 어제 랭킹용
    });

    it('TC-TIME-014 자정이 지나면 다음 자정을 다시 걸어 이튿날 자정에도 재로드한다', async () => {
      const h = await createHomeHarness({ now: BEFORE_MIDNIGHT });
      await h.viewModel.onShown();
      routeNextDay(h);
      await h.midnightSleeper.advance(SECOND);
      expect(h.viewModel.getSnapshot().todayDate.toString()).toBe('2026-10-28');
      expect(h.midnightSleeper.waiting).toBe(1);

      h.router
        .set('GET /topics?date=2026-10-29', 'home/topics__open-2026-10-28')
        .set(
          'GET /posts?topicDate=2026-10-29&sort=popular&page=1&pageSize=20',
          'home/posts-list__popular-5',
        );
      await h.midnightSleeper.advance(24 * 60 * 60 * SECOND);
      expect(h.viewModel.getSnapshot().todayDate.toString()).toBe('2026-10-29');
    });

    it('TC-TIME-014 홈이 안 보이면(onHidden) 자정 대기를 취소해 재로드하지 않고, 다시 보이면 새로 건다', async () => {
      const h = await createHomeHarness({ now: BEFORE_MIDNIGHT });
      await h.viewModel.onShown();
      routeNextDay(h);
      h.viewModel.onHidden();
      expect(h.midnightSleeper.waiting).toBe(0);
      const before = h.transport.requests.length;
      await h.midnightSleeper.advance(2 * SECOND);
      expect(h.transport.requests).toHaveLength(before);

      await h.viewModel.onShown(); // 이미 자정을 지나 다시 보임: 날짜 변경 판정으로 재로드
      expect(h.viewModel.getSnapshot().todayDate.toString()).toBe('2026-10-28');
      expect(h.midnightSleeper.waiting).toBe(1);
    });

    it('TC-TIME-014 onShown을 반복해도 자정 대기는 하나뿐이고 dispose하면 모두 걷는다', async () => {
      const h = await createHomeHarness({ now: BEFORE_MIDNIGHT });
      await h.viewModel.onShown();
      await h.viewModel.onShown();
      expect(h.midnightSleeper.waiting).toBe(1);
      h.viewModel.dispose();
      expect(h.midnightSleeper.waiting).toBe(0);
    });
  });
});
