import { createNetHarness } from '../core/http/__testing__/createNetHarness';
import { DefaultAiReviewPoller } from '../features/ai-review/DefaultAiReviewPoller';
import { FakeAiReviewPoller } from '../features/ai-review/__testing__/FakeAiReviewPoller';
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
  it('TC-AIR-018 주입하지 않으면 자리표시자가 아니라 실제 폴러가 만들어진다', () => {
    const { container } = create();
    expect(container.aiReview).toBeInstanceOf(DefaultAiReviewPoller);
  });

  it('주입한 폴러를 그대로 쓴다', () => {
    const aiReview = new FakeAiReviewPoller();
    const { container } = create({ aiReview });
    expect(container.aiReview).toBe(aiReview);
  });

  it('TC-AIR-044 로그아웃하면 실제 폴러의 사용자별 상태가 비워진다(UserDataCache)', async () => {
    const { container } = create();
    const clearAll = jest.spyOn(container.aiReview as unknown as { clearAll(): void }, 'clearAll');
    await container.authRepository.logout();
    expect(clearAll).toHaveBeenCalledTimes(1);
  });
});
