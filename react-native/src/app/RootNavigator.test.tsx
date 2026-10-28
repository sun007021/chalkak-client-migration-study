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

describe('RootNavigator 상세 화면', () => {
  it('상세 A가 열린 채로 상세 B로 이동하면 B가 보인다(같은 화면 이름이어도 postId가 다르면 다른 화면)', async () => {
    const container = await renderNavigator();
    await act(async () => container.navigationHandle.navigate('PostDetail', { postId: A }));
    await waitFor(() => expect(screen.getByTestId('feed.title')).toHaveTextContent('은행잎'));

    await act(async () => container.navigationHandle.navigate('PostDetail', { postId: B }));
    await waitFor(() => expect(screen.getByTestId('feed.title')).toHaveTextContent('빗소리 산책'));
  });

  it('세션을 읽지 못해도 상세 화면은 열린다(내 게시물 판정만 포기한다)', async () => {
    const container = await renderNavigator({ sessionLoadFails: true });
    await act(async () => container.navigationHandle.navigate('PostDetail', { postId: A }));
    await waitFor(() => expect(screen.getByTestId('feed.title')).toHaveTextContent('은행잎'));
  });
});

describe('RootNavigator 업로드 라우트', () => {
  it('REQ-UPL-008 topicDate를 읽을 수 없으면 오늘로 대신하지 않고 화면을 닫는다', async () => {
    const container = await renderNavigator();
    await act(async () =>
      container.navigationHandle.navigate('Upload', { topicDate: 'not-a-date' }),
    );
    await waitFor(() => expect(container.navigationHandle.getCurrentRoute()?.name).toBe('Home'));
    expect(screen.queryByTestId('upload.submit-button')).not.toBeOnTheScreen();
  });
});
