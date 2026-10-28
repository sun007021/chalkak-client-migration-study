import type { StoredSession } from '../core/auth/SessionStore';
import { ToastController } from '../core/ui/ToastController';
import type { SessionMode } from '../features/boot/authGate';
import { DisplayRepository } from '../features/display/DisplayRepository';
import { DisplayViewModel } from '../features/display/DisplayViewModel';
import { FeedRepository } from '../features/feed/FeedRepository';
import { FeedViewModel } from '../features/feed/FeedViewModel';
import { LikeRepository } from '../features/like/LikeRepository';
import { PostLikeStore } from '../features/like/PostLikeStore';
import { PostChanges } from '../features/post/PostChanges';
import type { PostSeed } from '../features/post/postModels';
import { GuestGate } from '../features/shell/GuestGate';
import { makeApiEnv } from './apiEnv';
import { FakeFeedNavigator, FakePostNavigator } from './FakePostNavigator';
import type { RouteValue } from './fixtureRouter';
import { FixtureRouter } from './fixtureRouter';
import { ME, guestSession, memberSession } from './fixtures';
import { GUEST_POST_ROUTES, POST_ROUTES } from './postRoutes';
import { SequentialIdGenerator } from './sequentialIds';
import { recordToasts } from './toastLog';

export interface PostHarnessOptions {
  mode?: SessionMode;
  /** ISO 시각. 기본 FIXTURE_NOW(KST 2026-10-27 12:00). */
  now?: string;
  session?: StoredSession;
  /** 기본 라우트 위에 덮어쓸 라우트. */
  routes?: Record<string, RouteValue>;
  /** true면 기본 라우트를 깔지 않는다(라우트에 없는 요청은 연결 실패로 거절되고 기록에 남는다). */
  bare?: boolean;
}

/**
 * 전시·상세·좋아요 ViewModel 단위 테스트용: 실제 Repository·ApiClient를 FakeFetch(FixtureRouter) 위에 엮는다.
 * 전시/상세 ViewModel은 필요할 때 display()/feed()로 만든다(같은 likes·changes를 공유 = 화면 간 동기 검증).
 */
export function createPostHarness(options: PostHarnessOptions = {}) {
  const mode = options.mode ?? 'member';
  const env = makeApiEnv(options.session ?? (mode === 'member' ? memberSession() : guestSession));
  if (options.now) env.clock.setWallClock(Date.parse(options.now));
  const defaults = options.bare ? {} : mode === 'member' ? POST_ROUTES : GUEST_POST_ROUTES;
  const router = new FixtureRouter(env.ff, { ...defaults, ...options.routes });
  const api = env.client();
  const toast = new ToastController({ clock: env.clock, ids: new SequentialIdGenerator() });
  const toasts = recordToasts(toast);
  const changes = new PostChanges();
  const likeRepository = new LikeRepository({ api });
  const likes = new PostLikeStore({ repository: likeRepository, changes, toast });
  const guestGate = new GuestGate({ toast });
  const displayRepository = new DisplayRepository({ api });
  const feedRepository = new FeedRepository({ api });
  const navigator = new FakePostNavigator();

  const display = (overrides: Partial<ConstructorParameters<typeof DisplayViewModel>[0]> = {}) =>
    new DisplayViewModel({ mode, clock: env.clock, repository: displayRepository, likes, changes, toast, guestGate, navigator, ...overrides });

  const feed = (
    args: { postId: string; seed?: PostSeed | null; assumeMine?: boolean; userId?: string | null; getUserId?: () => Promise<string | null>; repository?: FeedRepository },
  ) => {
    const feedNavigator = new FakeFeedNavigator();
    const vm = new FeedViewModel({
      postId: args.postId,
      seed: args.seed ?? null,
      assumeMine: args.assumeMine,
      getUserId: args.getUserId ?? (async () => (args.userId === undefined ? ME : args.userId)),
      clock: env.clock,
      repository: args.repository ?? feedRepository,
      likes,
      changes,
      toast,
      navigator: feedNavigator,
    });
    return { vm, navigator: feedNavigator };
  };

  return { ...env, mode, router, toast, toasts, changes, likeRepository, likes, guestGate, displayRepository, feedRepository, navigator, display, feed };
}

export type PostHarness = ReturnType<typeof createPostHarness>;
