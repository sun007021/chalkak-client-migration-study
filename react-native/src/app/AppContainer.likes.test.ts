import { createNetHarness } from '../core/http/__testing__/createNetHarness';
import { FakeLikeController } from '../features/like/__testing__/FakeLikeController';
import { AppContainer } from './AppContainer';

describe('AppContainer 좋아요 주입', () => {
  it('주입한 컨트롤러를 그대로 쓰고, clearAll이 있으면 로그아웃 때 비워진다', async () => {
    const net = createNetHarness();
    const likes = Object.assign(new FakeLikeController(), { clearAll: jest.fn() });
    const container = AppContainer.create(
      { apiBaseUrl: 'http://localhost:4010/api/v1/' },
      { clock: net.clock, sessionStore: net.sessionStore, events: net.events, api: net.api, likes },
    );
    expect(container.likes).toBe(likes);

    await container.authRepository.logout();

    expect(likes.clearAll).toHaveBeenCalledTimes(1);
  });

  it('주입하지 않으면 실제 컨트롤러가 만들어지고 로그아웃 때 비워진다', async () => {
    const net = createNetHarness();
    const container = AppContainer.create(
      { apiBaseUrl: 'http://localhost:4010/api/v1/' },
      { clock: net.clock, sessionStore: net.sessionStore, events: net.events, api: net.api },
    );
    const clearAll = jest.spyOn(container.likes as unknown as { clearAll(): void }, 'clearAll');

    await container.authRepository.logout();

    expect(clearAll).toHaveBeenCalledTimes(1);
  });
});
