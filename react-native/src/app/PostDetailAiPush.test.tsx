import { NavigationContainer } from '@react-navigation/native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FakeAnalyticsTracker } from '../core/analytics/__testing__/FakeAnalyticsTracker';
import { createNetHarness } from '../core/http/__testing__/createNetHarness';
import { FixtureRouter } from '../data/__testing__/FixtureRouter';
import { MEMBER_ROUTES, NOW } from '../features/home/__testing__/createHomeHarness';
import { AppContainer } from './AppContainer';
import { AppContainerProvider } from './AppContainerContext';
import { RootNavigator } from './RootNavigator';

const A = '22222222-2222-4222-8222-222222222202';
const B = '22222222-2222-4222-8222-222222222203';

async function renderNavigator(options: { sessionLoadFails?: boolean } = {}) {
  const net = createNetHarness();
  net.clock.set(NOW);
  await net.signIn({ userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  new FixtureRouter({
    ...MEMBER_ROUTES,
    [`GET /posts/${A}`]: 'feed/posts-detail__other',
    [`GET /posts/${B}`]: 'feed/posts-detail__mine-past',
    ['GET /posts/22222222-2222-4222-8222-222222222290/ai-review']:
      'ai-review/ai-review-get__completed',
  }).install(net.transport);
  const sessionStore = options.sessionLoadFails
    ? new Proxy(net.sessionStore, {
        get: (target, key, receiver) =>
          key === 'load'
            ? () => Promise.reject(new Error('storage'))
            : Reflect.get(target, key, receiver),
      })
    : net.sessionStore;
  const container = AppContainer.create(
    { apiBaseUrl: 'http://localhost:4010/api/v1/' },
    {
      clock: net.clock,
      sessionStore,
      events: net.events,
      api: net.api,
      analytics: new FakeAnalyticsTracker(),
    },
  );
  await render(
    <SafeAreaProvider>
      <AppContainerProvider container={container}>
        <NavigationContainer ref={container.navigationHandle}>
          <RootNavigator />
        </NavigationContainer>
      </AppContainerProvider>
    </SafeAreaProvider>,
  );
  return container;
}

describe('푸시 진입 시 AI 피드백 시트 (D-11)', () => {
  it('openAiSheet로 상세를 열면 결과가 확인된 뒤 시트가 한 번 열리고, 파라미터는 지워진다', async () => {
    const container = await renderNavigator();
    await act(async () =>
      container.navigationHandle.navigate('PostDetail', { postId: B, openAiSheet: true }),
    );
    await waitFor(() => expect(screen.getByTestId('feed.title')).toBeOnTheScreen());
    await waitFor(() => expect(screen.getByTestId('ai-result-sheet.root')).toBeOnTheScreen());
    const params = container.navigationHandle.getCurrentRoute()?.params as
      { openAiSheet?: boolean } | undefined;
    expect(params?.openAiSheet).toBeUndefined();
  });

  it('openAiSheet 없이 열면 시트는 자동으로 열리지 않는다', async () => {
    const container = await renderNavigator();
    await act(async () => container.navigationHandle.navigate('PostDetail', { postId: B }));
    await waitFor(() => expect(screen.getByTestId('feed.title')).toBeOnTheScreen());
    await act(async () => undefined);
    expect(screen.queryByTestId('ai-result-sheet.root')).not.toBeOnTheScreen();
  });
});
