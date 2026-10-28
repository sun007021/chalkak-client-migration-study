import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createNetHarness } from '../core/http/__testing__/createNetHarness';
import { json } from '../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../core/http/__testing__/loadFixture';
import { FixtureRouter, type RouteValue } from '../data/__testing__/FixtureRouter';
import { FakeAnalyticsTracker } from '../core/analytics/__testing__/FakeAnalyticsTracker';
import { MEMBER_ROUTES, NOW } from '../features/home/__testing__/createHomeHarness';
import { App } from './App';

const OK = { ok: true, config: { apiBaseUrl: 'http://localhost:4010/api/v1/' } } as const;
const ID = '22222222-2222-4222-8222-222222222202';

/** 홈 fixture 위에 상세·좋아요 라우트를 더한 가짜 서버. 컨테이너의 좋아요 컨트롤러는 override하지 않는다(기본 구현이 실제여야 한다). */
async function renderApp(extra: Record<string, RouteValue> = {}) {
  const net = createNetHarness();
  net.clock.set(NOW);
  await net.signIn({ userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  const router = new FixtureRouter({
    ...MEMBER_ROUTES,
    [`GET /posts/${ID}`]: 'feed/posts-detail__other',
    [`PUT /posts/${ID}/likes`]: () => json(200, { postId: ID, likeCount: 39, isLiked: true }),
    [`DELETE /posts/${ID}/likes`]: () => json(200, { postId: ID, likeCount: 38, isLiked: false }),
    ...extra,
  }).install(net.transport);
  await render(
    <App
      configResult={OK}
      overrides={{
        clock: net.clock,
        sessionStore: net.sessionStore,
        events: net.events,
        api: net.api,
        analytics: new FakeAnalyticsTracker(),
      }}
    />,
  );
  return { net, router };
}

describe('홈 → 게시물 상세 내비게이션 계약', () => {
  it('TC-FEED-001 REQ-NAV-027 홈 랭킹 사진을 누르면 상세가 열리고 하단 바가 숨겨지며 상세 응답 전에도 시드 내용이 보인다', async () => {
    const gateHolder: { release?: () => void } = {};
    const { router } = await renderApp();
    const gate = new Promise<void>((resolve) => (gateHolder.release = resolve));
    router.set(`GET /posts/${ID}`, async () => {
      await gate;
      return fixtureResponse('feed/posts-detail__other');
    });
    await fireEvent.press(await screen.findByTestId(`home.popular-item-${ID}`));
    expect(await screen.findByTestId('feed.root')).toBeOnTheScreen();
    expect(screen.queryByTestId('bottom-bar.root')).not.toBeOnTheScreen();
    expect(screen.getByTestId('feed.title')).toHaveTextContent('은행잎');
    expect(screen.getByTestId('feed.like-count')).toHaveTextContent('38');
    expect(screen.getByTestId('feed.like-button')).toBeDisabled();
    await act(async () => gateHolder.release?.());
    await waitFor(() => expect(screen.getByTestId('feed.like-button')).toBeEnabled());
  });

  it('TC-FEED-015 TC-FEED-013 뒤로가기는 홈으로 돌아가고 하단 바가 다시 보인다', async () => {
    await renderApp();
    await fireEvent.press(await screen.findByTestId(`home.popular-item-${ID}`));
    await screen.findByTestId('feed.root');
    await fireEvent.press(screen.getByTestId('feed.back-button'));
    expect(await screen.findByTestId('home.root')).toBeOnTheScreen();
    expect(screen.getByTestId('bottom-bar.root')).toBeOnTheScreen();
  });

  it('TC-LIKE-025 TC-LIKE-006 피드에서 누른 좋아요가 홈 랭킹 카드에 같은 값으로 즉시 보이고, 홈에서 취소하면 다시 상세에 반영된다', async () => {
    await renderApp();
    await fireEvent.press(await screen.findByTestId(`home.popular-item-${ID}`));
    await waitFor(() => expect(screen.getByTestId('feed.like-button')).toBeEnabled());
    await fireEvent.press(screen.getByTestId('feed.like-button'));
    expect(screen.getByTestId('feed.like-count')).toHaveTextContent('39');
    expect(screen.getByTestId('feed.like-button')).toBeSelected();

    await fireEvent.press(screen.getByTestId('feed.back-button'));
    await screen.findByTestId('home.root');
    await waitFor(() =>
      expect(screen.getByTestId(`home.popular-like-count-${ID}`)).toHaveTextContent('39'),
    );
    expect(screen.getByTestId(`home.popular-like-button-${ID}`)).toBeSelected();

    await fireEvent.press(screen.getByTestId(`home.popular-like-button-${ID}`));
    expect(screen.getByTestId(`home.popular-like-count-${ID}`)).toHaveTextContent('38');
    await fireEvent.press(screen.getByTestId(`home.popular-item-${ID}`));
    await screen.findByTestId('feed.root');
    expect(screen.getByTestId('feed.like-count')).toHaveTextContent('38');
    expect(screen.getByTestId('feed.like-button')).not.toBeSelected();
  });

  it('TC-LIKE-009 TC-LIKE-025 좋아요가 실패하면 모든 화면에서 롤백되고 토스트 "좋아요를 반영하지 못했어요"가 뜬다', async () => {
    await renderApp({ [`PUT /posts/${ID}/likes`]: 'like/posts-likes-put__500-server-error' });
    await fireEvent.press(await screen.findByTestId(`home.popular-like-button-${ID}`));
    expect(screen.getByTestId(`home.popular-like-count-${ID}`)).toHaveTextContent('39');
    await waitFor(() =>
      expect(screen.getByTestId(`home.popular-like-count-${ID}`)).toHaveTextContent('38'),
    );
    expect(await screen.findByTestId('toast.message')).toHaveTextContent(
      '좋아요를 반영하지 못했어요',
    );
  });
});
