import { ToastController } from '../core/ui/ToastController';
import { FeedAiViewModel } from '../features/aireview/FeedAiViewModel';
import { AiReviewRepository } from '../features/aireview/AiReviewRepository';
import { AiReviewStore } from '../features/aireview/AiReviewStore';
import type { AiWatchOptions } from '../features/aireview/AiReviewStore';
import { makeApiEnv } from './apiEnv';
import { loadFixture } from './fixtures';
import { FixtureRouter } from './fixtureRouter';
import type { RouteValue } from './fixtureRouter';
import { memberSession } from './fixtures';
import { MY_POST_ID, finish, settle } from './homeHarness';
import { SequentialIdGenerator } from './sequentialIds';
import { recordToasts } from './toastLog';

export { finish, settle };

/** ai-review fixture는 모두 이 게시물(내 오늘 게시물)의 것이다. */
export const AI_POST_ID = MY_POST_ID;
/** 지난 주제(2026-10-20)의 내 게시물(feed/posts-detail__mine-past.json). */
export const PAST_POST_ID = '22222222-2222-4222-8222-222222222290';

export const aiGet = (postId: string = AI_POST_ID): string => `GET /posts/${postId}/ai-review`;
export const aiPost = (postId: string = AI_POST_ID): string => `POST /posts/${postId}/ai-review`;
/** fixture 이름('processing')으로 ai-review GET/POST 라우트 값을 만든다. */
export const getFx = (name: string): string => `ai-review/ai-review-get__${name}`;
export const postFx = (name: string): string => `ai-review/ai-review-post__${name}`;

export interface AiHarnessOptions {
  routes?: Record<string, RouteValue>;
  /** ISO 시각. 기본 FIXTURE_NOW(KST 2026-10-27 12:00). */
  now?: string;
}

/** 저장소 단위 테스트용: 실제 AiReviewRepository·ApiClient를 FakeFetch(FixtureRouter) 위에 엮는다. 기본 GET은 NONE. */
export function createAiHarness(options: AiHarnessOptions = {}) {
  const env = makeApiEnv(memberSession());
  if (options.now) env.clock.setWallClock(Date.parse(options.now));
  const router = new FixtureRouter(env.ff, { [aiGet()]: getFx('none'), ...options.routes });
  const api = env.client();
  const toast = new ToastController({ clock: env.clock, ids: new SequentialIdGenerator() });
  const toasts = recordToasts(toast);
  const repository = new AiReviewRepository({ api });
  const store = new AiReviewStore({ repository, clock: env.clock, toast });
  const watch = (watchOptions: Partial<AiWatchOptions> = {}, postId: string = AI_POST_ID) => store.watch(postId, { refreshCompleted: true, ...watchOptions });
  return { ...env, router, toast, toasts, repository, store, watch };
}

export type AiHarness = ReturnType<typeof createAiHarness>;

/** 가상 시간(ms)을 전진한다(마이크로태스크를 비우며 도래한 타이머를 순서대로 실행). */
export const tick = async (h: Pick<AiHarness, 'clock'>, ms: number): Promise<void> => {
  await h.clock.advance(ms);
};

/** 라우트가 불린 가상 시각(단조 시계 ms)을 기록하며 fixture로 답하는 라우트 값. */
export function timed(h: Pick<AiHarness, 'clock'>, fixture: string | string[]) {
  const times: number[] = [];
  const fixtures = Array.isArray(fixture) ? fixture : [fixture];
  const route: RouteValue = () => {
    times.push(h.clock.monotonicMs());
    return loadFixture(`${fixtures[Math.min(times.length - 1, fixtures.length - 1)]}.json`).toResponse();
  };
  return { times, route };
}

/** GET 호출 수. */
export const gets = (h: Pick<AiHarness, 'router'>, postId: string = AI_POST_ID): number => h.router.calls(aiGet(postId)).length;
export const posts = (h: Pick<AiHarness, 'router'>, postId: string = AI_POST_ID): number => h.router.calls(aiPost(postId)).length;

export interface FeedAiHarnessOptions extends AiHarnessOptions {
  openAiReview?: boolean;
  postId?: string;
}

/** 상세 AI 영역 ViewModel 단위 테스트용: 저장소는 실제, 시계·fetch는 Fake. */
export function createFeedAiHarness(options: FeedAiHarnessOptions = {}) {
  const h = createAiHarness(options);
  const vm = new FeedAiViewModel({ postId: options.postId ?? AI_POST_ID, clock: h.clock, store: h.store, toast: h.toast, openAiReview: options.openAiReview ?? false });
  return { ...h, vm };
}

export type FeedAiHarness = ReturnType<typeof createFeedAiHarness>;
