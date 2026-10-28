import { NavigationContainer } from '@react-navigation/native';
import { act, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FakeAnalyticsTracker } from '../core/analytics/__testing__/FakeAnalyticsTracker';
import { createNetHarness } from '../core/http/__testing__/createNetHarness';
import { FixtureRouter } from '../data/__testing__/FixtureRouter';
import { MEMBER_ROUTES, NOW } from '../features/home/__testing__/createHomeHarness';
import { AppContainer } from './AppContainer';
import { AppContainerProvider } from './AppContainerContext';
import { NavigationNotificationNavigator } from './NavigationNotificationNavigator';
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

const names = (container: AppContainer): string[] =>
  (container.navigationHandle.getRootState()?.routes ?? []).map((route) => route.name);

describe('NavigationNotificationNavigator (실제 RootNavigator)', () => {
  it('상세가 열린 채로 openHome하면 Tabs를 새로 쌓지 않고 스택이 Tabs 하나로 돌아온다', async () => {
    const container = await renderNavigator();
    const navigator = new NavigationNotificationNavigator(container.navigationHandle);
    await act(async () => container.navigationHandle.navigate('PostDetail', { postId: A }));
    await waitFor(() => expect(names(container)).toEqual(['Tabs', 'PostDetail']));
    await act(async () => navigator.openHome());
    await waitFor(() => expect(names(container)).toEqual(['Tabs']));
  });

  it('알림 상세에서 openInbox하면 알림함이 두 번 쌓이지 않는다', async () => {
    const container = await renderNavigator();
    const navigator = new NavigationNotificationNavigator(container.navigationHandle);
    await act(async () => navigator.openInbox());
    await act(async () =>
      container.navigationHandle.navigate('NotificationDetail', { notificationId: 'n-1' }),
    );
    await act(async () => navigator.openInbox());
    await waitFor(() =>
      expect(names(container).filter((name) => name === 'Notifications')).toHaveLength(1),
    );
    expect(names(container).at(-1)).toBe('Notifications');
  });
});
