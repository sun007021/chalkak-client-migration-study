import { NavigationContainer } from '@react-navigation/native';
import { act, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FakeAnalyticsTracker } from '../core/analytics/__testing__/FakeAnalyticsTracker';
import { createNetHarness } from '../core/http/__testing__/createNetHarness';
import { FixtureRouter } from '../data/__testing__/FixtureRouter';
import type { PostSummary } from '../data/post/PostModels';
import { MEMBER_ROUTES, NOW } from '../features/home/__testing__/createHomeHarness';
import { AppContainer } from './AppContainer';
import { AppContainerProvider } from './AppContainerContext';
import { NavigationDisplayNavigator } from './NavigationDisplayNavigator';
import { NavigationHomeNavigator } from './NavigationHomeNavigator';
import { RootNavigator } from './RootNavigator';

const POST_ID = '22222222-2222-4222-8222-222222222202';

async function renderNavigator() {
  const net = createNetHarness();
  net.clock.set(NOW);
  await net.signIn({ userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  new FixtureRouter({
    ...MEMBER_ROUTES,
    [`GET /posts/${POST_ID}`]: 'feed/posts-detail__other',
  }).install(net.transport);
  const container = AppContainer.create(
    { apiBaseUrl: 'http://localhost:4010/api/v1/' },
    {
      clock: net.clock,
      sessionStore: net.sessionStore,
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

describe('쌓임 화면 연타 (실제 RootNavigator)', () => {
  it('TC-NAV-031 REQ-NAV-032 알림 벨을 연타해도 알림함은 하나만 쌓이고 뒤로 한 번에 홈으로 온다', async () => {
    const container = await renderNavigator();
    const navigator = new NavigationHomeNavigator(container.navigationHandle, { open: () => {} });
    await act(async () => {
      navigator.openNotifications();
      navigator.openNotifications();
      navigator.openNotifications();
    });
    await waitFor(() => expect(names(container)).toEqual(['Tabs', 'Notifications']));
    await act(async () => container.navigationHandle.goBack());
    await waitFor(() => expect(names(container)).toEqual(['Tabs']));
  });

  it('TC-NAV-032 REQ-NAV-032 전시 카드를 연타해도 피드(상세) 화면은 하나만 쌓인다', async () => {
    const container = await renderNavigator();
    const navigator = new NavigationDisplayNavigator(container.navigationHandle);
    const post = { id: POST_ID, imageUrl: 'https://img/1.webp', likeCount: 1, isLiked: false };
    await act(async () => {
      navigator.openPostDetail({ postId: POST_ID, seed: post as unknown as PostSummary });
      navigator.openPostDetail({ postId: POST_ID, seed: post as unknown as PostSummary });
    });
    await waitFor(() => expect(names(container)).toEqual(['Tabs', 'PostDetail']));
    await act(async () => container.navigationHandle.goBack());
    await waitFor(() => expect(names(container)).toEqual(['Tabs']));
  });
});
