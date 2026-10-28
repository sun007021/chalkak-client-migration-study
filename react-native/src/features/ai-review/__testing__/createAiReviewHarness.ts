import { createNetHarness, refreshOk } from '../../../core/http/__testing__/createNetHarness';
import { fixtureResponse } from '../../../core/http/__testing__/loadFixture';
import { FakeAppVisibility } from '../../../core/lifecycle/__testing__/FakeAppVisibility';
import { FakeToastPresenter } from '../../../core/toast/__testing__/FakeToastPresenter';
import { FixtureRouter, type RouteValue } from '../../../data/__testing__/FixtureRouter';
import { AiReviewRepository } from '../../../data/ai-review/AiReviewRepository';
import { FakeAuthFlowNavigator } from '../../auth/__testing__/FakeAuthFlowNavigator';
import { DefaultAiReviewPoller } from '../DefaultAiReviewPoller';
import { VirtualTimeSleeper } from './VirtualTimeSleeper';

/** 기준 시각: KST 2026-10-27(화) 12:00. */
export const NOW = '2026-10-27T03:00:00Z';
export const POST_ID = '22222222-2222-4222-8222-222222222201';
export const OTHER_POST_ID = '22222222-2222-4222-8222-222222222202';

export const GET_AI = `GET /posts/${POST_ID}/ai-review`;
export const POST_AI = `POST /posts/${POST_ID}/ai-review`;
export const GET_OTHER_AI = `GET /posts/${OTHER_POST_ID}/ai-review`;

export const fx = (name: string) => `ai-review/${name}`;

export const PROCESSING = fx('ai-review-get__processing');
export const COMPLETED = fx('ai-review-get__completed');
export const NONE = fx('ai-review-get__none');
export const FAILED_RETRY = fx('ai-review-get__failed-can-retry');
export const POST_202 = fx('ai-review-post__202-processing');

/** 풀어 줄 때까지 응답하지 않는 라우트. */
export function gate(fixture: string) {
  let release!: () => void;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  const route: RouteValue = async () => {
    await opened;
    return fixtureResponse(fixture);
  };
  return { route, release, opened };
}

export type AiReviewHarnessOptions = {
  routes?: Record<string, RouteValue>;
  now?: string;
  intervalMs?: number;
  windowMs?: number;
  mode?: 'member' | 'guest';
};

/**
 * 폴러를 실제 저장소·ApiClient 위에 올리고 시계와 폴링용 Sleeper(VirtualTimeSleeper)를 가짜로 둔다.
 * HTTP 재시도용 net.sleeper(FakeSleeper)는 폴링과 별개라 즉시 풀린다. 서버 요청 시각은 requestTimes로 기록한다.
 */
export async function createAiReviewHarness(options: AiReviewHarnessOptions = {}) {
  const net = createNetHarness();
  net.clock.set(options.now ?? NOW);
  if (options.mode === 'guest') await net.sessionStore.enterGuest();
  else await net.signIn();

  const requestTimes: { key: string; atMs: number }[] = [];
  const router = new FixtureRouter({
    [GET_AI]: NONE,
    [POST_AI]: POST_202,
    'POST /auth/refresh': () => refreshOk(),
    ...options.routes,
  });
  router.install(net.transport);
  const send = net.transport.send.bind(net.transport);
  net.transport.send = (request, sendOptions) => {
    const path = new URL(request.url).pathname.replace(/^\/api\/v1/, '');
    requestTimes.push({ key: `${request.method} ${path}`, atMs: net.clock.now().getTime() });
    return send(request, sendOptions);
  };

  const sleeper = new VirtualTimeSleeper(net.clock);
  const toast = new FakeToastPresenter();
  const authFlow = new FakeAuthFlowNavigator();
  const visibility = new FakeAppVisibility();
  const poller = new DefaultAiReviewPoller({
    reviews: new AiReviewRepository({ api: net.api }),
    clock: net.clock,
    sleeper,
    session: net.sessionStore,
    toast,
    authFlow,
    ...(options.intervalMs !== undefined ? { intervalMs: options.intervalMs } : {}),
    ...(options.windowMs !== undefined ? { windowMs: options.windowMs } : {}),
  });

  /** 해당 라우트로 나간 요청 수. */
  const count = (key: string): number => router.calls(key).length;
  /** 해당 요청이 나간 시각(epoch ms). 폴링 시작 시각과 빼서 경과 시간으로 비교한다. */
  const timesOf = (key: string): number[] =>
    requestTimes.filter((r) => r.key === key).map((r) => r.atMs);
  return {
    ...net,
    router,
    pollSleeper: sleeper,
    toast,
    authFlow,
    visibility,
    poller,
    count,
    timesOf,
  };
}

export type AiReviewHarness = Awaited<ReturnType<typeof createAiReviewHarness>>;
