import { FakeToastPresenter } from '../../../core/toast/__testing__/FakeToastPresenter';
import { FakeAppVisibility } from '../../../core/lifecycle/__testing__/FakeAppVisibility';
import { createNetHarness } from '../../../core/http/__testing__/createNetHarness';
import { BannerRepository } from '../../../data/banner/BannerRepository';
import { FixtureRouter, type RouteValue } from '../../../data/__testing__/FixtureRouter';
import { NotificationRepository } from '../../../data/notification/NotificationRepository';
import { PostRepository } from '../../../data/post/PostRepository';
import { TopicRepository } from '../../../data/topic/TopicRepository';
import { FakeAuthFlowNavigator } from '../../auth/__testing__/FakeAuthFlowNavigator';
import { FakeAiReviewPoller } from '../../ai-review/__testing__/FakeAiReviewPoller';
import type { MainMode } from '../../auth/AuthFlowNavigator';
import { BannerFeedViewModel } from '../../banner/BannerFeedViewModel';
import { FakeLikeController } from '../../like/__testing__/FakeLikeController';
import { FakePostChanges } from '../../post/__testing__/FakePostChanges';
import { HomeViewModel } from '../HomeViewModel';
import { FakeHomeNavigator } from './FakeHomeNavigator';

/** 기준 시각: KST 2026-10-27(화) 12:00. */
export const NOW = '2026-10-27T03:00:00Z';
export const MY_POST_ID = '22222222-2222-4222-8222-222222222201';

/** 회원의 성공 경로 기본 라우트(오늘 2026-10-27). 테스트가 필요한 키만 router.set으로 바꾼다. */
export const MEMBER_ROUTES: Record<string, RouteValue> = {
  'GET /topics?date=2026-10-27': 'home/topics__open-2026-10-27',
  'GET /topics?date=2026-10-26': 'home/topics__open-2026-10-26',
  'GET /posts?topicDate=2026-10-27&sort=popular&page=1&pageSize=20': 'home/posts-list__popular-8',
  'GET /posts?topicDate=2026-10-26&sort=popular&page=1&pageSize=20': 'home/posts-list__popular-3',
  'GET /posts/today': 'home/posts-today__posted-approved',
  'GET /posts/calendar?year=2026&month=10': 'home/posts-calendar__2026-10-week-approved',
  'GET /banners?page=1&pageSize=10': 'banner/banners__page1-10',
  'GET /banners?page=2&pageSize=10': 'banner/banners__page2-last',
  'GET /notifications/unread-status': 'home/notifications-unread-status__false',
};

/** 게스트는 개인 API 라우트가 없다: 불리면 "예상하지 못한 요청"으로 실패한다. */
export const GUEST_ROUTES: Record<string, RouteValue> = Object.fromEntries(
  Object.entries(MEMBER_ROUTES).filter(
    ([key]) => !/\/posts\/today|\/posts\/calendar|unread-status/.test(key),
  ),
);

export type HomeHarnessOptions = { mode?: MainMode; now?: string };

export async function createHomeHarness(options: HomeHarnessOptions = {}) {
  const mode = options.mode ?? 'member';
  const net = createNetHarness();
  net.clock.set(options.now ?? NOW);
  if (mode === 'member') await net.signIn();
  else await net.sessionStore.enterGuest();

  const router = new FixtureRouter(mode === 'member' ? MEMBER_ROUTES : GUEST_ROUTES).install(
    net.transport,
  );
  const bannerFeed = new BannerFeedViewModel({
    repository: new BannerRepository({ api: net.api }),
  });
  const likes = new FakeLikeController();
  const changes = new FakePostChanges();
  const aiReview = new FakeAiReviewPoller();
  const visibility = new FakeAppVisibility();
  const navigator = new FakeHomeNavigator();
  const toast = new FakeToastPresenter();
  const authFlow = new FakeAuthFlowNavigator();
  const viewModel = new HomeViewModel({
    mode,
    clock: net.clock,
    topics: new TopicRepository({ api: net.api }),
    posts: new PostRepository({ api: net.api }),
    notifications: new NotificationRepository({ api: net.api }),
    bannerFeed,
    likes,
    changes,
    aiReview,
    visibility,
    navigator,
    toast,
    authFlow,
  });
  return {
    ...net,
    router,
    bannerFeed,
    likes,
    changes,
    aiReview,
    visibility,
    navigator,
    toast,
    authFlow,
    viewModel,
  };
}

export type HomeHarness = Awaited<ReturnType<typeof createHomeHarness>>;

/** 마이크로태스크를 충분히 비운다(요청 시작·응답 반영 확인용). */
export async function flush(times = 60): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}
