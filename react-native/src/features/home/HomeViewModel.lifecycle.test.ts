import { deferred, networkFailure } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { t } from '../../shared/copy';
import { createHomeHarness } from './__testing__/createHomeHarness';
import type { HomeHarness } from './__testing__/createHomeHarness';

const TODAY_POSTS = 'GET /posts?topicDate=2026-10-27&sort=popular&page=1&pageSize=20';
const UNREAD = 'GET /notifications/unread-status';
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** 새 날짜(10/28) 라우트. 자정 직후 재로드 테스트용. */
function routeNextDay(h: HomeHarness) {
  h.router
    .set('GET /topics?date=2026-10-28', 'home/topics__open-2026-10-28')
    .set('GET /topics?date=2026-10-27', 'home/topics__open-2026-10-27')
    .set(
      'GET /posts?topicDate=2026-10-28&sort=popular&page=1&pageSize=20',
      'home/posts-list__popular-5',
    )
    .set('GET /posts/calendar?year=2026&month=10', 'home/posts-calendar__2026-10-week-approved');
}

describe('HomeViewModel 새로고침 (D-20)', () => {
  it('TC-HOME-035 REQ-HOME-038 새로고침 중에는 기존 내용을 유지하고 refreshing이 켜지며 성공하면 교체한다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    const gate = deferred<void>();
    h.router.set('GET /posts/today', async () => {
      await gate.promise;
      return fixtureResponse('home/posts-today__posted-pending');
    });

    const refreshing = h.viewModel.refresh();
    await settle();
    let state = h.viewModel.getSnapshot();
    expect(state.refreshing).toBe(true);
    expect(state.hero).toMatchObject({ kind: 'photo', pending: false });
    expect(state.popular.status).toBe('ready');

    gate.resolve();
    await refreshing;
    state = h.viewModel.getSnapshot();
    expect(state.refreshing).toBe(false);
    expect(state.hero).toMatchObject({ kind: 'photo', pending: true });
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-HOME-035 REQ-HOME-038 새로고침은 모든 섹션과 배너 1페이지를 다시 요청한다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    const before = h.transport.requests.length;
    await h.viewModel.refresh();
    const paths = h.transport.requests
      .slice(before)
      .map((r) => new URL(r.url).pathname.replace('/api/v1', ''));
    expect(paths.sort()).toEqual(
      [
        '/banners',
        '/notifications/unread-status',
        '/posts',
        '/posts',
        '/posts/calendar',
        '/posts/today',
        '/topics',
        '/topics',
      ].sort(),
    );
  });

  it('TC-HOME-035 REQ-HOME-039 연결 실패면 기존 내용을 유지하고 토스트 "네트워크 연결을 확인해 주세요."를 한 번만 띄운다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    h.router.set('GET /posts/today', networkFailure());
    await h.viewModel.refresh();
    const state = h.viewModel.getSnapshot();
    expect(state.hero.kind).toBe('photo');
    expect(state.refreshing).toBe(false);
    expect(h.toast.messages).toEqual([t('common.error.network')]);
  });

  it('TC-HOME-035 REQ-HOME-039 서버 오류면 기존 내용을 유지하고 그 섹션의 오류 문구를 토스트로 띄운다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    h.router.set('GET /posts/today', 'home/posts-today__500-server-error');
    await h.viewModel.refresh();
    expect(h.viewModel.getSnapshot().hero.kind).toBe('photo');
    expect(h.toast.messages).toEqual([t('home.hero.error')]);
  });

  it('REQ-HOME-039 여러 섹션이 동시에 실패해도 토스트는 최대 1건(표시 순서상 첫 실패 섹션)이다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    h.router.set('GET /posts/today', 'home/posts-today__500-server-error');
    h.router.set('GET /posts/calendar?year=2026&month=10', 'home/posts-calendar__500-server-error');
    h.router.set('GET /banners?page=1&pageSize=10', 'banner/banners__500-server-error');
    await h.viewModel.refresh();
    expect(h.toast.messages).toEqual([t('home.hero.error')]);
    expect(h.viewModel.getSnapshot().weekly.status).toBe('ready');
    expect(h.bannerFeed.getSnapshot().status).toBe('ready');
  });

  it('TC-BANR-011 배너만 새로고침에 실패하면 기존 배너를 유지하고 토스트로 알린다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    h.router.set('GET /banners?page=1&pageSize=10', 'banner/banners__500-server-error');
    await h.viewModel.refresh();
    expect(h.toast.messages).toEqual([t('home.banner.error')]);
    expect(h.bannerFeed.getSnapshot()).toMatchObject({ status: 'ready' });
  });

  it('TC-HOME-036 새로고침 중 연타해도 요청 세트는 1회만 나간다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    const gate = deferred<void>();
    h.router.set(TODAY_POSTS, async () => {
      await gate.promise;
      return fixtureResponse('home/posts-list__popular-8');
    });
    const first = h.viewModel.refresh();
    await settle();
    const second = h.viewModel.refresh();
    const third = h.viewModel.refresh();
    gate.resolve();
    await Promise.all([first, second, third]);
    expect(h.router.calls(TODAY_POSTS)).toHaveLength(1);
  });

  it('TC-HOME-037 REQ-HOME-042 느린 조용한 갱신 A보다 새로고침 B가 먼저 도착하면 A의 응답이 B를 덮지 않는다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    const slow = deferred<void>();
    h.router.set('GET /posts/today', async (_req, index) => {
      if (index === 0) {
        await slow.promise;
        return fixtureResponse('home/posts-today__posted-validating'); // A: 오래된 응답
      }
      return fixtureResponse('home/posts-today__posted-pending'); // B
    });

    h.visibility.emit('background');
    h.visibility.emit('foreground'); // A 시작(조용한 갱신)
    await settle();
    await h.viewModel.refresh(); // B
    expect(h.viewModel.getSnapshot().hero).toMatchObject({ kind: 'photo', pending: true });

    slow.resolve();
    await settle();
    expect(h.viewModel.getSnapshot().hero).toMatchObject({ kind: 'photo', pending: true });
  });

  it('TC-HOME-038 REQ-HOME-042 홈이 안 보이게 되어 요청이 취소돼도 오류 토스트·오류 상태 없이 내용이 유지된다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    const gate = deferred<void>();
    h.router.set('GET /posts/today', async () => {
      await gate.promise;
      return fixtureResponse('home/posts-today__not-posted');
    });
    const refreshing = h.viewModel.refresh();
    await settle();

    h.viewModel.onHidden();
    gate.resolve();
    await refreshing;
    await settle();

    const state = h.viewModel.getSnapshot();
    expect(state.hero.kind).toBe('photo');
    expect(state.refreshing).toBe(false);
    expect(h.toast.messages).toEqual([]);
  });

  it('D-20 홈이 안 보일 때는 실패해도 토스트를 띄우지 않는다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    h.viewModel.onHidden();
    h.router.set('GET /posts/today', 'home/posts-today__500-server-error');
    await h.viewModel.refresh();
    expect(h.toast.messages).toEqual([]);
  });

  it('REQ-HOME-044 푸시 TOPIC/REMINDER로 열리면 scrollToTopToken을 올리고 새로고침한다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    const before = h.transport.requests.length;
    const token = h.viewModel.getSnapshot().scrollToTopToken;
    await h.viewModel.onHomePushOpened();
    expect(h.viewModel.getSnapshot().scrollToTopToken).toBe(token + 1);
    expect(h.transport.requests.length).toBeGreaterThan(before);
    await h.viewModel.onHomePushOpened();
    expect(h.viewModel.getSnapshot().scrollToTopToken).toBe(token + 2);
  });
});

describe('HomeViewModel 복귀·재진입 조용한 갱신', () => {
  it('TC-HOME-039 REQ-HOME-040 포그라운드 복귀는 인디케이터 없이 재조회해 성공하면 교체한다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    const seen: boolean[] = [];
    h.viewModel.subscribe(() => seen.push(h.viewModel.getSnapshot().refreshing));
    h.router.set('GET /posts/today', 'home/posts-today__posted-pending');

    h.visibility.emit('background');
    h.visibility.emit('foreground');
    await settle();

    expect(seen.every((v) => v === false)).toBe(true);
    expect(h.viewModel.getSnapshot().hero).toMatchObject({ kind: 'photo', pending: true });
  });

  it('TC-HOME-039 조용한 갱신이 실패하면 기존 내용을 유지하고 토스트도 없다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    h.router.set('GET /posts/today', networkFailure());
    h.visibility.emit('foreground');
    await settle();
    expect(h.viewModel.getSnapshot().hero.kind).toBe('photo');
    expect(h.toast.messages).toEqual([]);
  });

  it('REQ-HOME-040 이미 불러온 뒤 onShown을 다시 부르면 화면을 비우지 않고 갱신한다(loading으로 돌아가지 않음)', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    const kinds: string[] = [];
    h.viewModel.subscribe(() => kinds.push(h.viewModel.getSnapshot().hero.kind));
    await h.viewModel.onShown();
    expect(kinds).not.toContain('loading');
    expect(h.router.calls('GET /posts/today')).toHaveLength(2);
  });

  it('홈이 안 보이는 동안(onHidden)에는 포그라운드 복귀에 반응하지 않고, 구독도 해제된다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    expect(h.visibility.listenerCount).toBe(1);
    h.viewModel.onHidden();
    expect(h.visibility.listenerCount).toBe(0);
    const before = h.transport.requests.length;
    h.visibility.emit('foreground');
    await settle();
    expect(h.transport.requests).toHaveLength(before);
  });
});

describe('HomeViewModel KST 날짜 변경 (REQ-HOME-041)', () => {
  it('TC-HOME-040 KST 23:59:59에는 재로드 없이 10/27 기준 그대로다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    h.clock.set('2026-10-27T14:59:59Z');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().todayDate.toString()).toBe('2026-10-27');
    expect(h.router.calls('GET /topics?date=2026-10-28')).toHaveLength(0);
    expect(h.router.calls('GET /topics?date=2026-10-27')).toHaveLength(2); // 같은 날짜의 조용한 갱신
  });

  it('TC-HOME-041 KST 00:00:00을 지나 홈이 다시 보이면 오늘=10/28, 어제 랭킹=10/27로 전체를 다시 불러오고 이전 날짜 내용이 섞이지 않는다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    routeNextDay(h);
    const seenTopics: (string | null)[] = [];
    h.viewModel.subscribe(() => {
      const topic = h.viewModel.getSnapshot().topic;
      seenTopics.push(
        topic.status === 'ready' ? (topic.topic?.topicDate.toString() ?? null) : null,
      );
    });

    h.clock.set('2026-10-27T15:00:00Z');
    await h.viewModel.onShown();

    const state = h.viewModel.getSnapshot();
    expect(state.todayDate.toString()).toBe('2026-10-28');
    expect(state.yesterdayDate.toString()).toBe('2026-10-27');
    expect(state.topic).toMatchObject({ status: 'ready', topic: { title: '골목길' } });
    expect(h.router.calls('GET /topics?date=2026-10-28')).toHaveLength(1);
    expect(h.router.calls('GET /posts/today').length).toBeGreaterThan(0);
    expect(seenTopics).not.toContain('2026-10-27'); // 날짜가 바뀌면 먼저 비우고 새로 채운다
  });

  it('TC-HOME-041 포그라운드 복귀로도 날짜 변경을 감지한다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    routeNextDay(h);
    h.clock.set('2026-10-27T15:00:00Z');
    h.visibility.emit('foreground');
    await settle();
    expect(h.viewModel.getSnapshot().todayDate.toString()).toBe('2026-10-28');
  });

  it('TC-HOME-042 자정 직후 새 주제가 아직 없으면 히어로 no-open-topic, 오늘 인기는 빈 ready, 어제 랭킹은 10/27 기준이다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    routeNextDay(h);
    h.router
      .set('GET /topics?date=2026-10-28', 'home/topics__404-not-found')
      .set('GET /posts/today', 'home/posts-today__404-no-open-topic')
      .set(
        'GET /posts?topicDate=2026-10-27&sort=popular&page=1&pageSize=20',
        'home/posts-list__popular-3',
      );

    h.clock.set('2026-10-27T15:00:00Z');
    await h.viewModel.onShown();

    const state = h.viewModel.getSnapshot();
    expect(state.hero).toEqual({ kind: 'no-open-topic' });
    expect(state.topic).toEqual({ status: 'ready', topic: null });
    expect(state.popular).toEqual({ status: 'ready', posts: [] });
    expect(state.yesterday.status).toBe('ready');
    expect(h.router.calls('GET /topics?date=2026-10-27')).toHaveLength(1);
  });

  it('TC-HOME-043 토요일 23:59:59를 지나 일요일 00:00:00이 되면 이번 주 범위가 11/1~11/7, 조회 월이 2026-11로 바뀐다', async () => {
    const h = await createHomeHarness({ now: '2026-10-31T14:59:59Z' });
    h.router
      .set('GET /topics?date=2026-10-31', 'home/topics__404-not-found')
      .set('GET /topics?date=2026-10-30', 'home/topics__404-not-found')
      .set('GET /topics?date=2026-11-01', 'home/topics__404-not-found')
      .set('GET /posts/calendar?year=2026&month=10', 'home/posts-calendar__2026-10-empty')
      .set('GET /posts/calendar?year=2026&month=11', 'home/posts-calendar__2026-11-empty');
    await h.viewModel.onShown();
    const first = h.viewModel.getSnapshot().weekly;
    expect(first.status === 'ready' && first.days[0].date.toString()).toBe('2026-10-25');

    h.clock.set('2026-10-31T15:00:00Z');
    await h.viewModel.onShown();
    const second = h.viewModel.getSnapshot().weekly;
    expect(second.status === 'ready' && second.days.map((d) => d.date.toString())).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
    ]);
    expect(h.router.calls('GET /posts/calendar?year=2026&month=11')).toHaveLength(1);
  });
});

describe('HomeViewModel 알림 미읽음 (D-10)', () => {
  it('TC-HOME-050 hasUnread=true면 점 상태가 켜지고 false면 꺼진다', async () => {
    const h = await createHomeHarness();
    h.router.set(UNREAD, 'home/notifications-unread-status__true');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().hasUnread).toBe(true);

    h.router.set(UNREAD, 'home/notifications-unread-status__false');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().hasUnread).toBe(false);
  });

  it('TC-HOME-051 REQ-HOME-045 홈이 보일 때·포그라운드 복귀·알림함에서 돌아옴·푸시 수신마다 1회씩 재조회한다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    expect(h.router.calls(UNREAD)).toHaveLength(1);

    h.visibility.emit('foreground');
    await settle();
    expect(h.router.calls(UNREAD)).toHaveLength(2);

    h.viewModel.onNotificationPress(); // 알림함으로 이동
    expect(h.navigator.calls).toEqual([{ type: 'notifications' }]);
    await h.viewModel.onShown(); // 알림함에서 돌아옴
    expect(h.router.calls(UNREAD)).toHaveLength(3);

    await h.viewModel.onPushReceived();
    expect(h.router.calls(UNREAD)).toHaveLength(4);
    // 푸시 수신은 미읽음만 다시 부른다
    expect(h.router.calls('GET /posts/today')).toHaveLength(3);
  });

  it('TC-HOME-052 조회가 실패하면 점은 직전 값을 유지하고 토스트·오류 UI가 없다', async () => {
    const h = await createHomeHarness();
    h.router.set(UNREAD, 'home/notifications-unread-status__true');
    await h.viewModel.onShown();
    h.router.set(UNREAD, 'home/notifications-unread-status__500-server-error');
    await h.viewModel.onPushReceived();
    expect(h.viewModel.getSnapshot().hasUnread).toBe(true);
    h.router.set(UNREAD, networkFailure());
    await h.viewModel.onPushReceived();
    expect(h.viewModel.getSnapshot().hasUnread).toBe(true);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-HOME-052 새로고침 중 미읽음 실패는 토스트 대상이 아니다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    h.router.set(UNREAD, 'home/notifications-unread-status__500-server-error');
    await h.viewModel.refresh();
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-HOME-048 REQ-HOME-045 회원이 알림 버튼을 누르면 알림함으로 이동한다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    h.viewModel.onNotificationPress();
    expect(h.navigator.calls).toEqual([{ type: 'notifications' }]);
    expect(h.toast.messages).toEqual([]);
  });
});

describe('HomeViewModel 계정 전환·정리 (UserDataCache)', () => {
  it('TC-HOME-044 clearAll은 이전 계정의 상태를 비우고 진행 중이던 요청의 늦은 응답은 무시한다', async () => {
    const h = await createHomeHarness();
    const late = deferred<void>();
    h.router.set('GET /posts/today', async () => {
      await late.promise;
      return fixtureResponse('home/posts-today__posted-approved');
    });
    const loading = h.viewModel.onShown();
    await settle();

    h.viewModel.clearAll();
    const cleared = h.viewModel.getSnapshot();
    expect(cleared.hero).toEqual({ kind: 'loading' });
    expect(cleared.popular).toEqual({ status: 'loading' });
    expect(cleared.hasUnread).toBe(false);
    expect(cleared.aiCardPostId).toBeNull();
    expect(h.bannerFeed.getSnapshot()).toEqual({ status: 'loading' });

    late.resolve();
    await loading;
    await settle();
    expect(h.viewModel.getSnapshot().hero).toEqual({ kind: 'loading' });
  });

  it('TC-HOME-044 이미 불러온 내용도 clearAll로 지워지고 B 계정 진입(onShown)은 처음부터 다시 불러온다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    h.viewModel.clearAll();
    expect(h.viewModel.getSnapshot().weekly).toEqual({ status: 'loading' });
    h.router.set('GET /posts/today', 'home/posts-today__not-posted');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().hero).toEqual({ kind: 'empty', banned: false });
  });

  it('dispose 뒤에는 구독이 해제되고 폴러·좋아요·포그라운드 구독이 남지 않는다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    h.viewModel.dispose();
    expect(h.visibility.listenerCount).toBe(0);
    expect(h.likes.listenerCount).toBe(0);
    expect(h.aiReview.calls.at(-1)).toBe('stop');
  });
});
