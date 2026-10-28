import { createNetHarness, refreshOk } from '../../../core/http/__testing__/createNetHarness';
import { FakeToastPresenter } from '../../../core/toast/__testing__/FakeToastPresenter';
import { fixtureResponse } from '../../../core/http/__testing__/loadFixture';
import { FixtureRouter, type RouteValue } from '../../../data/__testing__/FixtureRouter';
import { PostRepository } from '../../../data/post/PostRepository';
import type { PostSummary } from '../../../data/post/PostModels';
import { FakeAuthFlowNavigator } from '../../auth/__testing__/FakeAuthFlowNavigator';
import { FakeLikeController } from '../../like/__testing__/FakeLikeController';
import { FakePostChanges } from '../../post/__testing__/FakePostChanges';
import { FeedViewModel } from '../FeedViewModel';
import type { FeedSeed, FeedTarget } from '../FeedTarget';
import { FakeFeedNavigator } from './FakeFeedNavigator';

export const NOW = '2026-10-27T03:00:00Z';
export const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const MINE = '22222222-2222-4222-8222-222222222201';
export const OTHER = '22222222-2222-4222-8222-222222222202';

export const GET_MINE = `GET /posts/22222222-2222-4222-8222-222222222201`;
export const PUT_MINE = `PUT /posts/22222222-2222-4222-8222-222222222201`;
export const DELETE_MINE = `DELETE /posts/22222222-2222-4222-8222-222222222201`;
export const GET_OTHER = `GET /posts/22222222-2222-4222-8222-222222222202`;
const post = (id: string): string => `/posts/${id}`;

export const gated = (router: FixtureRouter, key: string, fixture: string) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  router.set(key, async () => {
    await gate;
    return fixtureResponse(fixture);
  });
  return { release };
};

export const FEED_ROUTES: Record<string, RouteValue> = {
  [`GET ${post(MINE)}`]: 'feed/posts-detail__mine-today',
  [`GET ${post(OTHER)}`]: 'feed/posts-detail__other',
  [`PUT ${post(MINE)}`]: 'feed/posts-title-update__200',
  [`DELETE ${post(MINE)}`]: 'feed/posts-delete__204',
  'POST /auth/refresh': () => refreshOk(),
};

/** 목록 항목 시드(전시·랭킹에서 연 경우). */
export const listSeed = (overrides: Partial<PostSummary> = {}): PostSummary => ({
  id: OTHER,
  authorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  originalImageUrl: `https://cdn.example.test/posts/${OTHER}/original.webp`,
  thumbnailImageUrl: `https://cdn.example.test/posts/${OTHER}/thumbnail.webp`,
  signatureOriginalImageUrl:
    'https://cdn.example.test/signatures/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/original.png',
  signatureThumbnailImageUrl: null,
  title: '은행잎',
  submittedAt: new Date('2026-10-27T02:59:00Z'),
  likeCount: 38,
  isLiked: false,
  isMine: false,
  ...overrides,
});

/** toFeedSeed 스텁에 기대지 않도록 하네스가 직접 복사한다. */
const seedOf = (p: PostSummary): FeedSeed => ({
  id: p.id,
  authorId: p.authorId,
  originalImageUrl: p.originalImageUrl,
  thumbnailImageUrl: p.thumbnailImageUrl,
  signatureOriginalImageUrl: p.signatureOriginalImageUrl,
  title: p.title,
  likeCount: p.likeCount,
  isLiked: p.isLiked,
  isMine: p.isMine,
});

export type FeedHarnessOptions = {
  /** 열 게시물: 'list'는 seed로 연 전시/랭킹, 'mine'은 기록·푸시, 'direct'는 시드 없는 목록 진입. */
  open:
    | { entry: 'list'; seed: PostSummary }
    | { entry: 'mine'; postId: string }
    | { entry: 'list'; postId: string };
  routes?: Record<string, RouteValue>;
  now?: string;
  userId?: string;
};

export async function createFeedHarness(options: FeedHarnessOptions) {
  const net = createNetHarness();
  net.clock.set(options.now ?? NOW);
  await net.signIn({ userId: options.userId ?? USER_A });
  const router = new FixtureRouter({ ...FEED_ROUTES, ...options.routes }).install(net.transport);
  const likes = new FakeLikeController();
  const changes = new FakePostChanges();
  const navigator = new FakeFeedNavigator();
  const toast = new FakeToastPresenter();
  const authFlow = new FakeAuthFlowNavigator();
  const open = options.open;
  const target: FeedTarget =
    'seed' in open
      ? { postId: open.seed.id, entry: 'list', seed: seedOf(open.seed) }
      : { postId: open.postId, entry: open.entry, seed: null };
  const viewModel = new FeedViewModel({
    target,
    userId: options.userId ?? USER_A,
    clock: net.clock,
    posts: new PostRepository({ api: net.api }),
    likes,
    changes,
    navigator,
    toast,
    authFlow,
  });
  return { ...net, router, likes, changes, navigator, toast, authFlow, viewModel, target };
}

export type FeedHarness = Awaited<ReturnType<typeof createFeedHarness>>;
