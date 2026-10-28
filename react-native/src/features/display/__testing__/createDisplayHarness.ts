import { createNetHarness } from '../../../core/http/__testing__/createNetHarness';
import { json } from '../../../core/http/__testing__/FakeTransport';
import { fixtureBody, fixtureResponse } from '../../../core/http/__testing__/loadFixture';
import { FakeToastPresenter } from '../../../core/toast/__testing__/FakeToastPresenter';
import { FixtureRouter, type RouteValue } from '../../../data/__testing__/FixtureRouter';
import { PostRepository } from '../../../data/post/PostRepository';
import { TopicRepository } from '../../../data/topic/TopicRepository';
import type { MainMode } from '../../auth/AuthFlowNavigator';
import { FakeLikeController } from '../../like/__testing__/FakeLikeController';
import { FakePostChanges } from '../../post/__testing__/FakePostChanges';
import { DisplayViewModel } from '../DisplayViewModel';
import { FakeDisplayNavigator } from './FakeDisplayNavigator';

/** 기준 시각: KST 2026-10-27(화) 12:00. */
export const NOW = '2026-10-27T03:00:00Z';
/** 카탈로그의 사용자 A는 11111111-…이지만 상세 fixture의 내 게시물 authorId는 aaaaaaaa-…이다([가정]: fixture 기준을 따른다). */
export const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const ID = (n: string) => `22222222-2222-4222-8222-2222222222${n}`;

export const q = (date: string, sort: string, page: number, seed?: string) =>
  `GET /posts?topicDate=${date}&sort=${sort}&page=${page}&pageSize=20${seed ? `&randomSeed=${seed}` : ''}`;

/** 해당 날짜의 주제 응답(오늘 fixture의 topicDate만 바꾼다). */
export const topicOn = (date: string): RouteValue =>
  (() =>
    json(200, {
      ...fixtureBody<Record<string, unknown>>('display/topics__open-2026-10-27'),
      topicDate: date,
    })) as RouteValue;

/** 성공 경로 기본 라우트(오늘 2026-10-27). 테스트가 필요한 키만 router.set으로 바꾼다. */
export const DISPLAY_ROUTES: Record<string, RouteValue> = {
  'GET /topics?date=2026-10-27': 'display/topics__open-2026-10-27',
  'GET /topics?date=2026-10-26': 'display/topics__open-2026-10-26',
  'GET /topics?date=2026-09-17': 'display/topics__first-date-2026-09-17',
  [q('2026-10-27', 'recent', 1)]: 'display/posts-list__recent-page1',
  [q('2026-10-27', 'recent', 2)]: 'display/posts-list__recent-page2',
  [q('2026-10-27', 'popular', 1)]: 'display/posts-list__popular-page1',
  [q('2026-10-27', 'random', 1)]: 'display/posts-list__random-page1-seed',
  [q('2026-10-27', 'random', 2, 'seed_abc123')]: 'display/posts-list__random-page2',
  [q('2026-10-26', 'popular', 1)]: 'display/posts-list__popular-page1',
  [q('2026-09-17', 'popular', 1)]: 'display/posts-list__popular-3',
};

export type DisplayHarnessOptions = {
  mode?: MainMode;
  now?: string;
  routes?: Record<string, RouteValue>;
};

export async function createDisplayHarness(options: DisplayHarnessOptions = {}) {
  const mode = options.mode ?? 'member';
  const net = createNetHarness();
  net.clock.set(options.now ?? NOW);
  if (mode === 'member') await net.signIn({ userId: USER_A });
  else await net.sessionStore.enterGuest();
  const router = new FixtureRouter({ ...DISPLAY_ROUTES, ...options.routes }).install(net.transport);
  const likes = new FakeLikeController();
  const changes = new FakePostChanges();
  const navigator = new FakeDisplayNavigator();
  const toast = new FakeToastPresenter();
  const viewModel = new DisplayViewModel({
    mode,
    clock: net.clock,
    topics: new TopicRepository({ api: net.api }),
    posts: new PostRepository({ api: net.api }),
    likes,
    changes,
    navigator,
    toast,
  });
  /** 요청이 지금까지 몇 번 나갔나(라우트 키 기준). */
  const callsOf = (key: string) => router.calls(key).length;
  return { ...net, router, likes, changes, navigator, toast, viewModel, callsOf };
}

export type DisplayHarness = Awaited<ReturnType<typeof createDisplayHarness>>;

/** 열 때까지 응답을 미루는 라우트(지연 응답 시나리오). `release()`로 응답을 내보낸다. */
export function gatedRoute(router: FixtureRouter, key: string, fixture: string) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  router.set(key, async () => {
    await gate;
    return fixtureResponse(fixture);
  });
  return { release };
}

/** 오늘 외 날짜들의 주제·인기순 라우트를 만든다(날짜 이동 시나리오용). */
export function datedRoutes(dates: readonly string[], posts = 'display/posts-list__popular-3') {
  const routes: Record<string, RouteValue> = {};
  for (const date of dates) {
    routes[`GET /topics?date=${date}`] = topicOn(date);
    routes[q(date, 'popular', 1)] = posts;
    routes[q(date, 'recent', 1)] = 'display/posts-list__recent-page1';
  }
  return routes;
}

export const topicRequests = (net: { transport: { requests: { url: string }[] } }): string[] =>
  net.transport.requests
    .filter((r) => new URL(r.url).pathname.endsWith('/topics'))
    .map((r) => new URL(r.url).searchParams.get('date') ?? '');
