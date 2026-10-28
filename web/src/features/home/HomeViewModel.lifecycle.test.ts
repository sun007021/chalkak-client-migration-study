import { t } from '../../copy/ko';
import { networkFailure } from '../../test/fakeFetch';
import { deferred } from '../../test/deferred';
import { loadFixture } from '../../test/fixtures';
import { BANNERS_P1, CALENDAR_OCT, POPULAR_TODAY, MY_POST_ID, TODAY_POST, TOPICS_TODAY, UNREAD, createHomeHarness, finish, settle } from '../../test/homeHarness';
import type { HomeHarness } from '../../test/homeHarness';

const at = (iso: string) => Date.parse(iso);

/** 새 날짜(10/28) 라우트. 자정 직후 재로드 테스트용. */
function routeNextDay(h: HomeHarness) {
  h.router
    .set('GET /topics?date=2026-10-28', 'home/topics__open-2026-10-28')
    .set('GET /posts?topicDate=2026-10-28&sort=popular&page=1&pageSize=20', 'home/posts-list__popular-5')
    .set(CALENDAR_OCT, 'home/posts-calendar__2026-10-week-approved');
}

describe('HomeViewModel 새로고침 (D-20)', () => {
  it('TC-HOME-035 REQ-HOME-038 새로고침 중에는 기존 내용을 유지하고 refreshing이 켜지며 성공하면 교체한다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    const gate = deferred<void>();
    h.router.set(TODAY_POST, async () => {
      await gate.promise;
      return loadFixture('home/posts-today__posted-pending.json').toResponse();
    });

    const refreshing = h.viewModel.refresh();
    await settle();
    let state = h.viewModel.state;
    expect(state.refreshing).toBe(true);
    expect(state.hero).toMatchObject({ kind: 'photo', pending: false });
    expect(state.popular.status).toBe('ready');

    gate.resolve();
    await finish(h, refreshing);
    state = h.viewModel.state;
    expect(state.refreshing).toBe(false);
    expect(state.hero).toMatchObject({ kind: 'photo', pending: true });
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-HOME-035 REQ-HOME-038 새로고침은 모든 섹션과 배너 1페이지를 다시 요청한다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    const before = h.ff.calls.length;
    await finish(h, h.viewModel.refresh());
    const sent = h.ff.calls.slice(before).map((c) => c.path).sort();
    expect(sent).toEqual(['/banners', '/notifications/unread-status', '/posts', '/posts', '/posts/calendar', '/posts/today', `/posts/${MY_POST_ID}/ai-review`, '/topics', '/topics'].sort());
    expect(h.router.calls(BANNERS_P1)).toHaveLength(2);
  });

  it('TC-HOME-035 REQ-HOME-039 연결 실패면 기존 내용을 유지하고 토스트 "네트워크 연결을 확인해 주세요."를 한 번만 띄운다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    h.router.set(TODAY_POST, networkFailure);
    await finish(h, h.viewModel.refresh());
    const state = h.viewModel.state;
    expect(state.hero.kind).toBe('photo');
    expect(state.refreshing).toBe(false);
    expect(h.toasts.messages).toEqual([t('common.error.network')]);
  });

  it('TC-HOME-035 REQ-HOME-039 서버 오류면 기존 내용을 유지하고 그 섹션의 오류 문구를 토스트로 띄운다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    h.router.set(TODAY_POST, 'home/posts-today__500-server-error');
    await finish(h, h.viewModel.refresh());
    expect(h.viewModel.state.hero.kind).toBe('photo');
    expect(h.toasts.messages).toEqual([t('home.hero.error')]);
  });

  it('REQ-HOME-039 여러 섹션이 동시에 실패해도 토스트는 최대 1건(표시 순서상 첫 실패 섹션)이고 기존 내용은 모두 유지된다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    h.router.set(TODAY_POST, 'home/posts-today__500-server-error');
    h.router.set(CALENDAR_OCT, 'home/posts-calendar__500-server-error');
    h.router.set(BANNERS_P1, 'banner/banners__500-server-error');
    await finish(h, h.viewModel.refresh());
    expect(h.toasts.messages).toEqual([t('home.hero.error')]);
    expect(h.viewModel.state.weekly.status).toBe('ready');
    expect(h.banners.state.status).toBe('ready');
  });

  it('TC-BANR-011 REQ-BANR-011 배너만 새로고침에 실패하면 기존 배너를 유지하고 토스트로 알린다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    h.router.set(BANNERS_P1, 'banner/banners__500-server-error');
    await finish(h, h.viewModel.refresh());
    expect(h.toasts.messages).toEqual([t('home.banner.error')]);
    expect(h.banners.state).toMatchObject({ status: 'ready' });
  });

  it('TC-HOME-036 새로고침 중 연타해도 요청 세트는 1회만 나간다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    const gate = deferred<void>();
    h.router.set(POPULAR_TODAY, async () => {
      await gate.promise;
      return loadFixture('home/posts-list__popular-8.json').toResponse();
    });
    const first = h.viewModel.refresh();
    await settle();
    const second = h.viewModel.refresh();
    const third = h.viewModel.refresh();
    gate.resolve();
    await finish(h, Promise.all([first, second, third]));
    expect(h.router.calls(POPULAR_TODAY)).toHaveLength(1);
  });

  it('TC-HOME-037 REQ-HOME-042 느린 조용한 갱신 A보다 새로고침 B가 먼저 도착하면 A의 응답이 B를 덮지 않는다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    const slow = deferred<void>();
    h.router.set(TODAY_POST, async (_req, index) => {
      if (index === 0) {
        await slow.promise;
        return loadFixture('home/posts-today__posted-validating.json').toResponse(); // A: 오래된 응답
      }
      return loadFixture('home/posts-today__posted-pending.json').toResponse(); // B
    });

    const silent = h.viewModel.onShown(); // A 시작(조용한 갱신, 문서가 다시 보임)
    await settle();
    await finish(h, h.viewModel.refresh()); // B
    expect(h.viewModel.state.hero).toMatchObject({ kind: 'photo', pending: true });

    slow.resolve();
    await finish(h, silent);
    expect(h.viewModel.state.hero).toMatchObject({ kind: 'photo', pending: true });
  });

  it('TC-HOME-038 REQ-HOME-042 홈이 안 보이게 되어 요청이 취소돼도 오류 토스트·오류 상태 없이 내용이 유지된다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    const gate = deferred<void>();
    h.router.set(TODAY_POST, async () => {
      await gate.promise;
      return loadFixture('home/posts-today__not-posted.json').toResponse();
    });
    const refreshing = h.viewModel.refresh();
    await settle();

    h.viewModel.onHidden();
    gate.resolve();
    await finish(h, refreshing);
    await settle();

    const state = h.viewModel.state;
    expect(state.hero.kind).toBe('photo');
    expect(state.refreshing).toBe(false);
    expect(h.toasts.messages).toEqual([]);
  });

  it('D-20 홈이 안 보일 때는 실패해도 토스트를 띄우지 않는다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    h.viewModel.onHidden();
    h.router.set(TODAY_POST, 'home/posts-today__500-server-error');
    await finish(h, h.viewModel.refresh());
    expect(h.toasts.messages).toEqual([]);
  });
});

describe('HomeViewModel 재진입·복귀 조용한 갱신 (REQ-HOME-040)', () => {
  it('TC-HOME-039 REQ-HOME-040 홈이 다시 보이면 인디케이터 없이 재조회해 성공하면 교체한다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    const seen: boolean[] = [];
    h.viewModel.subscribe(() => seen.push(h.viewModel.state.refreshing));
    h.router.set(TODAY_POST, 'home/posts-today__posted-pending');

    h.viewModel.onHidden();
    await finish(h, h.viewModel.onShown());

    expect(seen.every((v) => v === false)).toBe(true);
    expect(h.viewModel.state.hero).toMatchObject({ kind: 'photo', pending: true });
  });

  it('TC-HOME-039 조용한 갱신이 실패하면 기존 내용을 유지하고 토스트도 없다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    h.router.set(TODAY_POST, networkFailure);
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.hero.kind).toBe('photo');
    expect(h.toasts.messages).toEqual([]);
  });

  it('REQ-HOME-040 이미 불러온 뒤 onShown을 다시 부르면 화면을 비우지 않고 갱신한다(loading으로 돌아가지 않음)', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    const kinds: string[] = [];
    const sections: string[] = [];
    h.viewModel.subscribe(() => {
      kinds.push(h.viewModel.state.hero.kind);
      sections.push(h.viewModel.state.popular.status, h.viewModel.state.weekly.status, h.viewModel.state.topic.status);
    });
    await finish(h, h.viewModel.onShown());
    expect(kinds).not.toContain('loading');
    expect(sections).not.toContain('loading');
    expect(h.router.calls(TODAY_POST)).toHaveLength(2);
  });
});

describe('HomeViewModel KST 날짜 변경 (REQ-HOME-041)', () => {
  it('TC-HOME-040 KST 23:59:59에는 재로드 없이 10/27 기준 그대로다(같은 날짜의 조용한 갱신만)', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    h.clock.setWallClock(at('2026-10-27T14:59:59Z'));
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.todayDate).toBe('2026-10-27');
    expect(h.router.calls('GET /topics?date=2026-10-28')).toHaveLength(0);
    expect(h.router.calls(TOPICS_TODAY)).toHaveLength(2);
  });

  it('TC-HOME-041 KST 00:00:00을 지나 홈이 다시 보이면 오늘=10/28, 어제 랭킹=10/27로 전체를 다시 불러오고 이전 날짜 내용이 섞이지 않는다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    routeNextDay(h);
    const seenTopicDates: (string | null)[] = [];
    h.viewModel.subscribe(() => {
      const topic = h.viewModel.state.topic;
      seenTopicDates.push(topic.status === 'ready' ? (topic.topic?.topicDate ?? null) : null);
    });

    h.clock.setWallClock(at('2026-10-27T15:00:00Z'));
    await finish(h, h.viewModel.onShown());

    const state = h.viewModel.state;
    expect(state.todayDate).toBe('2026-10-28');
    expect(state.yesterdayDate).toBe('2026-10-27');
    expect(state.topic).toMatchObject({ status: 'ready', topic: { title: '골목길' } });
    expect(h.router.calls('GET /topics?date=2026-10-28')).toHaveLength(1);
    expect(h.router.calls('GET /topics?date=2026-10-27').length).toBeGreaterThan(0); // 어제 랭킹의 주제
    expect(h.router.calls(TODAY_POST).length).toBeGreaterThan(0);
    expect(seenTopicDates).not.toContain('2026-10-27'); // 날짜가 바뀌면 먼저 비우고 새로 채운다
  });

  it('TC-HOME-041 날짜가 바뀌는 순간 이전 날짜의 섹션은 loading으로 비워진다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    routeNextDay(h);
    const gate = deferred<void>();
    h.router.set('GET /topics?date=2026-10-28', async () => {
      await gate.promise;
      return loadFixture('home/topics__open-2026-10-28.json').toResponse();
    });
    h.clock.setWallClock(at('2026-10-27T15:00:00Z'));
    const reloading = h.viewModel.onShown();
    await settle();
    expect(h.viewModel.state).toMatchObject({ todayDate: '2026-10-28', topic: { status: 'loading' }, popular: { status: 'loading' } });
    gate.resolve();
    await finish(h, reloading);
    expect(h.viewModel.state.topic.status).toBe('ready');
  });

  it('TC-HOME-042 자정 직후 새 주제가 아직 없으면 히어로 no-open-topic, 오늘 인기는 빈 ready, 어제 랭킹은 10/27 기준이다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    routeNextDay(h);
    h.router
      .set('GET /topics?date=2026-10-28', 'home/topics__404-not-found')
      .set(TODAY_POST, 'home/posts-today__404-no-open-topic')
      .set('GET /posts?topicDate=2026-10-27&sort=popular&page=1&pageSize=20', 'home/posts-list__popular-3');

    h.clock.setWallClock(at('2026-10-27T15:00:00Z'));
    await finish(h, h.viewModel.onShown());

    const state = h.viewModel.state;
    expect(state.hero).toEqual({ kind: 'no-open-topic' });
    expect(state.topic).toEqual({ status: 'ready', topic: null });
    expect(state.popular).toEqual({ status: 'ready', posts: [] });
    expect(state.yesterday.status).toBe('ready');
  });

  it('TC-HOME-043 토요일 23:59:59를 지나 일요일 00:00:00이 되면 이번 주 범위가 11/1~11/7, 조회 월이 2026-11로 바뀐다', async () => {
    const h = createHomeHarness({ now: '2026-10-31T14:59:59Z' });
    for (const date of ['2026-10-30', '2026-10-31', '2026-11-01']) h.router.set(`GET /topics?date=${date}`, 'home/topics__404-not-found');
    h.router.set('GET /posts/calendar?year=2026&month=10', 'home/posts-calendar__2026-10-empty');
    h.router.set('GET /posts/calendar?year=2026&month=11', 'home/posts-calendar__2026-11-empty');
    await finish(h, h.viewModel.onShown());
    const first = h.viewModel.state.weekly;
    expect(first.status === 'ready' && first.days[0]!.date).toBe('2026-10-25');

    h.clock.setWallClock(at('2026-10-31T15:00:00Z'));
    await finish(h, h.viewModel.onShown());
    const second = h.viewModel.state.weekly;
    expect(second.status === 'ready' && second.days.map((d) => d.date)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
    expect(h.router.calls('GET /posts/calendar?year=2026&month=11')).toHaveLength(1);
  });

  it('진행 중인 새로고침이 있어도 KST 자정을 지났으면 새 날짜 기준으로 다시 시작한다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    const gate = deferred<void>();
    h.router.set(TODAY_POST, async () => {
      await gate.promise;
      return loadFixture('home/posts-today__posted-approved.json').toResponse();
    });
    const first = h.viewModel.refresh();
    await settle();

    routeNextDay(h);
    h.clock.setWallClock(at('2026-10-27T15:00:00Z'));
    const second = h.viewModel.refresh();
    gate.resolve();
    await finish(h, Promise.all([first, second]));

    expect(h.viewModel.state.todayDate).toBe('2026-10-28');
    expect(h.viewModel.state.topic).toMatchObject({ status: 'ready', topic: { title: '골목길' } });
    expect(h.router.calls('GET /topics?date=2026-10-28')).toHaveLength(1);
  });
});

describe('HomeViewModel 알림 미읽음 (D-10)', () => {
  it('TC-HOME-050 hasUnread=true면 점 상태가 켜지고 false면 꺼진다', async () => {
    const h = createHomeHarness();
    h.router.set(UNREAD, 'home/notifications-unread-status__true');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.hasUnread).toBe(true);

    h.router.set(UNREAD, 'home/notifications-unread-status__false');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.hasUnread).toBe(false);
  });

  it('TC-HOME-051 REQ-HOME-045 홈이 보일 때마다(마운트·문서 복귀·알림함에서 돌아옴) 1회씩, refreshUnread는 미읽음만 다시 조회한다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    expect(h.router.calls(UNREAD)).toHaveLength(1);

    h.viewModel.onHidden(); // 문서가 숨겨졌다가
    await finish(h, h.viewModel.onShown()); // 다시 보임
    expect(h.router.calls(UNREAD)).toHaveLength(2);

    h.viewModel.onNotificationPress(); // 알림함으로 이동
    expect(h.navigator.calls).toEqual([{ type: 'notifications' }]);
    await finish(h, h.viewModel.onShown()); // 알림함에서 돌아옴(Web은 홈이 다시 마운트되어 onShown)
    expect(h.router.calls(UNREAD)).toHaveLength(3);

    await finish(h, h.viewModel.refreshUnread());
    expect(h.router.calls(UNREAD)).toHaveLength(4);
    expect(h.router.calls(TODAY_POST)).toHaveLength(3); // refreshUnread는 미읽음만
  });

  it('TC-HOME-052 조회가 실패하면 점은 직전 값을 유지하고 토스트·오류 UI가 없다', async () => {
    const h = createHomeHarness();
    h.router.set(UNREAD, 'home/notifications-unread-status__true');
    await finish(h, h.viewModel.onShown());
    h.router.set(UNREAD, 'home/notifications-unread-status__500-server-error');
    await finish(h, h.viewModel.refreshUnread());
    expect(h.viewModel.state.hasUnread).toBe(true);
    h.router.set(UNREAD, networkFailure);
    await finish(h, h.viewModel.refreshUnread());
    expect(h.viewModel.state.hasUnread).toBe(true);
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-HOME-052 새로고침 중 미읽음 실패는 토스트 대상이 아니다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    h.router.set(UNREAD, 'home/notifications-unread-status__500-server-error');
    await finish(h, h.viewModel.refresh());
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-HOME-048 REQ-HOME-045 회원이 알림 버튼을 누르면 알림함으로 이동한다(토스트 없음)', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    h.viewModel.onNotificationPress();
    expect(h.navigator.calls).toEqual([{ type: 'notifications' }]);
    expect(h.toasts.messages).toEqual([]);
  });
});

describe('HomeViewModel 정리 (TC-HOME-044, REQ-HOME-042)', () => {
  it('TC-HOME-044 dispose 뒤에는 진행 중이던 요청의 늦은 응답이 상태·토스트를 바꾸지 않는다(계정 전환)', async () => {
    const h = createHomeHarness();
    const late = deferred<void>();
    h.router.set(TODAY_POST, async () => {
      await late.promise;
      return loadFixture('home/posts-today__posted-approved.json').toResponse();
    });
    const loading = h.viewModel.onShown();
    await settle();

    h.viewModel.dispose();
    const frozen = h.viewModel.state;
    late.resolve();
    await finish(h, loading);
    await settle();
    expect(h.viewModel.state).toBe(frozen);
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-HOME-044 새 홈(새 ViewModel)은 이전 계정의 값 없이 loading에서 시작한다', async () => {
    const a = createHomeHarness();
    await finish(a, a.viewModel.onShown());
    expect(a.viewModel.state.hero.kind).toBe('photo');
    a.viewModel.dispose();
    const b = createHomeHarness();
    expect(b.viewModel.state).toMatchObject({ hero: { kind: 'loading' }, popular: { status: 'loading' }, weekly: { status: 'loading' }, ai: { kind: 'hidden' }, hasUnread: false });
    expect(b.banners.state).toEqual({ status: 'loading' });
  });

  it('TC-HOME-045 오프라인 첫 진입: 각 섹션이 error이고 온라인 복귀 후 다시 시도하면 로드된다', async () => {
    const h = createHomeHarness();
    for (const key of [TOPICS_TODAY, 'GET /topics?date=2026-10-26', TODAY_POST, CALENDAR_OCT, BANNERS_P1]) h.router.set(key, networkFailure);
    await finish(h, h.viewModel.onShown());
    const state = h.viewModel.state;
    expect(state.topic).toEqual({ status: 'error' });
    expect(state.hero).toEqual({ kind: 'error' });
    expect(state.weekly).toEqual({ status: 'error' });
    expect(state.popular).toEqual({ status: 'error' });
    expect(state.yesterday).toEqual({ status: 'error' });
    expect(h.banners.state).toEqual({ status: 'error' });

    h.router.set(TOPICS_TODAY, 'home/topics__open-2026-10-27');
    h.router.set('GET /topics?date=2026-10-26', 'home/topics__open-2026-10-26');
    h.router.set(TODAY_POST, 'home/posts-today__posted-approved');
    h.router.set(CALENDAR_OCT, 'home/posts-calendar__2026-10-week-approved');
    h.router.set(BANNERS_P1, 'banner/banners__page1-10');
    await finish(h, h.viewModel.retryTopic());
    await finish(h, h.viewModel.retryHero());
    await finish(h, h.viewModel.retryWeekly());
    await finish(h, h.viewModel.retryRanking('yesterday'));
    await finish(h, h.viewModel.retryBanners());
    expect(h.viewModel.state).toMatchObject({ topic: { status: 'ready' }, hero: { kind: 'photo' }, weekly: { status: 'ready' }, popular: { status: 'ready' }, yesterday: { status: 'ready' } });
    expect(h.banners.state.status).toBe('ready');
  });
});
