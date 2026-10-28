import { createNetHarness } from '../core/http/__testing__/createNetHarness';
import { FixtureRouter } from '../data/__testing__/FixtureRouter';
import { DefaultAiReviewPoller } from '../features/ai-review/DefaultAiReviewPoller';
import { FakeAiReviewPoller } from '../features/ai-review/__testing__/FakeAiReviewPoller';
import { VirtualTimeSleeper } from '../features/ai-review/__testing__/VirtualTimeSleeper';
import {
  GET_AI,
  POST_ID,
  PROCESSING,
} from '../features/ai-review/__testing__/createAiReviewHarness';
import { AppContainer } from './AppContainer';

function create(overrides: Parameters<typeof AppContainer.create>[1] = {}) {
  const net = createNetHarness();
  const container = AppContainer.create(
    { apiBaseUrl: 'http://localhost:4010/api/v1/' },
    {
      clock: net.clock,
      sessionStore: net.sessionStore,
      events: net.events,
      api: net.api,
      ...overrides,
    },
  );
  return { net, container };
}

describe('AppContainer AI 피드백 주입 (PR8)', () => {
  it('TC-AIR-018 주입하지 않으면 자리표시자가 아니라 실제 폴러가 만들어지고 화면용 면도 있다', () => {
    const { container } = create();
    expect(container.aiReview).toBeInstanceOf(DefaultAiReviewPoller);
    expect(container.aiReviewSession).toBe(container.aiReview);
  });

  it('주입한 폴러를 그대로 쓰고, 화면용 폴러를 주지 않으면 AI 영역은 그려지지 않는다', () => {
    const aiReview = new FakeAiReviewPoller();
    const { container } = create({ aiReview });
    expect(container.aiReview).toBe(aiReview);
    expect(container.aiReviewSession).toBeNull();
    expect(() =>
      container.createAiReviewViewModel({
        target: { postId: POST_ID, topicDate: null, isMine: true },
        surface: 'feed',
      }),
    ).toThrow();
  });

  it('TC-AIR-044 로그아웃하면 진행 중인 폴링이 실제로 멈추고 상태가 비워진다(UserDataCache)', async () => {
    const net = createNetHarness();
    await net.signIn();
    const router = new FixtureRouter({
      [GET_AI]: PROCESSING,
      'POST /auth/logout': 'common/error__internal-500',
    }).install(net.transport);
    const sleeper = new VirtualTimeSleeper(net.clock);
    const container = AppContainer.create(
      { apiBaseUrl: 'http://localhost:4010/api/v1/' },
      {
        clock: net.clock,
        sessionStore: net.sessionStore,
        events: net.events,
        api: net.api,
        sleeper,
      },
    );
    container.aiReview.start(POST_ID);
    await sleeper.advance(3000);
    expect(router.calls(GET_AI)).toHaveLength(2);

    await container.authRepository.logout();
    await sleeper.advance(60_000);

    expect(router.calls(GET_AI)).toHaveLength(2);
    expect(container.aiReviewSession?.getSnapshot()).toMatchObject({
      postId: null,
      review: null,
      phase: 'idle',
    });
  });
});
