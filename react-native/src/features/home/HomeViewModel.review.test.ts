import { deferred, json } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { createHomeHarness, MY_POST_ID } from './__testing__/createHomeHarness';
import type { HomeHarness } from './__testing__/createHomeHarness';

const settle = () => new Promise((resolve) => setImmediate(resolve));
const POP_TODAY = 'GET /posts?topicDate=2026-10-27&sort=popular&page=1&pageSize=20';
const TOPIC_TODAY = 'GET /topics?date=2026-10-27';

const unauthorized = async () =>
  json(401, { errorCode: 'UNAUTHORIZED', message: '인증이 필요합니다.' });

describe('HomeViewModel 남은 401 UNAUTHORIZED (REQ-NET-023, boot-auth 확인 필요 5)', () => {
  async function expiredRefreshHarness() {
    const h = await createHomeHarness();
    // refresh token이 이미 만료된 세션: 갱신 없이 AuthenticationRequiredError가 된다(REQ-NET-018, 세션은 유지).
    await h.signIn({ refreshTokenExpiresAt: new Date(h.clock.now().getTime() - 1) });
    return h;
  }

  it('임시 동작: 세션은 지우지 않고 로그인 화면으로 보낸다(요청이 여러 개 401이어도 한 번)', async () => {
    const h = await expiredRefreshHarness();
    h.router
      .set('GET /posts/today', unauthorized)
      .set('GET /posts/calendar?year=2026&month=10', unauthorized)
      .set('GET /notifications/unread-status', unauthorized);
    await h.viewModel.onShown();
    expect(h.authFlow.calls).toEqual(['login']);
    expect((await h.sessionStore.load()).kind).toBe('authenticated');
  });

  it('일반 오류로 보이지 않는다: 히어로·주간이 error가 되지 않고 새로고침 토스트도 없다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    await h.signIn({ refreshTokenExpiresAt: new Date(h.clock.now().getTime() - 1) });
    h.router.set('GET /posts/today', unauthorized);
    await h.viewModel.refresh();
    expect(h.authFlow.calls).toEqual(['login']);
    expect(h.toast.messages).toEqual([]);
    expect(h.viewModel.getSnapshot().hero).toMatchObject({ kind: 'photo' });
    expect(h.viewModel.getSnapshot().refreshing).toBe(false);
  });
});

describe('HomeViewModel AI 폴러와 포그라운드 복귀', () => {
  it('백그라운드에서 돌아올 때 히어로 재조회가 실패해도 보이는 카드의 폴러를 다시 시작한다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    h.visibility.emit('background');
    expect(h.aiReview.calls).toEqual([`start:${MY_POST_ID}`, 'stop']);

    // 달력이 성공하면 publishHero가 폴러를 다시 맞추므로, 히어로와 달력이 모두 실패해도 되살아나야 한다.
    h.router
      .set('GET /posts/today', 'home/posts-today__500-server-error')
      .set('GET /posts/calendar?year=2026&month=10', 'home/posts-calendar__500-server-error');
    h.visibility.emit('foreground');
    await settle();
    expect(h.viewModel.getSnapshot().aiCardPostId).toBe(MY_POST_ID);
    expect(h.aiReview.calls).toEqual([`start:${MY_POST_ID}`, 'stop', `start:${MY_POST_ID}`]);
  });

  it('홈이 보이는 동안 시작한 적 없는 폴러는 정지 호출도 하지 않는다', async () => {
    const h = await createHomeHarness({ mode: 'guest' });
    await h.viewModel.onShown();
    h.visibility.emit('background');
    expect(h.aiReview.calls).toEqual([]);
  });
});

describe('HomeViewModel.refresh 날짜 변경', () => {
  it('진행 중인 새로고침이 있어도 KST 자정을 지났으면 새 날짜 기준으로 다시 시작한다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    const gate = deferred<void>();
    h.router.set('GET /posts/today', async () => {
      await gate.promise;
      return fixtureResponse('home/posts-today__posted-approved');
    });
    const first = h.viewModel.refresh();
    await settle();

    h.router
      .set('GET /topics?date=2026-10-28', 'home/topics__open-2026-10-28')
      .set(TOPIC_TODAY, 'home/topics__open-2026-10-27')
      .set(
        'GET /posts?topicDate=2026-10-28&sort=popular&page=1&pageSize=20',
        'home/posts-list__popular-5',
      );
    h.clock.set('2026-10-27T15:00:00Z');
    const second = h.viewModel.refresh();
    gate.resolve();
    await Promise.all([first, second]);

    const state = h.viewModel.getSnapshot();
    expect(state.todayDate.toString()).toBe('2026-10-28');
    expect(state.topic).toMatchObject({ status: 'ready', topic: { title: '골목길' } });
    expect(h.router.calls('GET /topics?date=2026-10-28')).toHaveLength(1);
  });
});

describe('HomeViewModel.retryRanking("popular")', () => {
  it('주제가 이미 보이면 주제를 다시 받지 않고 그 주제로 오늘 인기만 다시 받는다(주제와 인기가 어긋나지 않는다)', async () => {
    const h = await createHomeHarness();
    h.router.set(POP_TODAY, 'home/posts-list__500-server-error');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().popular.status).toBe('error');

    h.router.set(POP_TODAY, 'home/posts-list__popular-8');
    h.router.set(TOPIC_TODAY, 'home/topics__404-not-found'); // 다시 받았다면 어긋났을 응답
    await h.viewModel.retryRanking('popular');

    const state = h.viewModel.getSnapshot();
    expect(h.router.calls(TOPIC_TODAY)).toHaveLength(0);
    expect(state.topic).toMatchObject({ status: 'ready', topic: { title: '가을 하늘' } });
    expect(state.popular.status).toBe('ready');
  });

  it('주제가 오류 상태였다면 주제부터 함께 다시 받는다', async () => {
    const h = await createHomeHarness();
    h.router.set(TOPIC_TODAY, async () =>
      json(500, { errorCode: 'INTERNAL_ERROR', message: '서버 오류' }),
    );
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({
      topic: { status: 'error' },
      popular: { status: 'error' },
    });

    h.router.set(TOPIC_TODAY, 'home/topics__open-2026-10-27');
    await (h as HomeHarness).viewModel.retryRanking('popular');
    expect(h.viewModel.getSnapshot()).toMatchObject({ topic: { status: 'ready' } });
    expect(h.viewModel.getSnapshot().popular.status).toBe('ready');
  });
});

describe('HomeViewModel AI 폴러 소유자', () => {
  it('폴러를 시작하고 멈출 때 자기 자신을 소유자로 넘긴다(상세가 가져간 폴링을 멈추지 않게)', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    h.visibility.emit('background');
    expect(h.aiReview.calls).toEqual([`start:${MY_POST_ID}`, 'stop']);
    expect(h.aiReview.owners).toEqual([h.viewModel, h.viewModel]);
  });
});
