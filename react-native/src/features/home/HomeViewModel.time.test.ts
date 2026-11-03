import { createHomeHarness, MY_POST_ID } from './__testing__/createHomeHarness';

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
});
