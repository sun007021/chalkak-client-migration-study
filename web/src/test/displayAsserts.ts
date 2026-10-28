import { loadFixture } from './fixtures';
import type { DisplayState } from '../features/display/DisplayViewModel';
import type { DisplayViewModel } from '../features/display/DisplayViewModel';
import { finish } from './homeHarness';
import type { PostHarness } from './postHarness';

export type ReadyBody = Extract<DisplayState['body'], { status: 'ready' }>;

/** state.body가 ready일 때만 돌려준다. */
export function ready(vm: DisplayViewModel): ReadyBody {
  const { body } = vm.state;
  if (body.status !== 'ready') throw new Error(`body is ${body.status}`);
  return body;
}

/** 게시물 id의 끝 세 자리(fixture 번호). */
export const ids = (posts: readonly { id: string }[]): string[] => posts.map((p) => p.id.slice(-3));

/** 오늘(2026-10-27) 최신순 전시를 열고 끝날 때까지 기다린다. */
export async function openToday(h: PostHarness, vm: DisplayViewModel, route: { date?: string | null; sort?: 'recent' | 'popular' | 'random' | null } = {}) {
  await finish(h, vm.applyRoute({ date: route.date ?? null, sort: route.sort ?? null }));
}

/** 200개 이하의 연속 번호 id: 201~220 → ['201', ...]. */
export const range = (from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));

/** 약속이 풀릴 때까지 붙잡았다가 fixture로 답하는 라우트 값(응답 지연·순서 재현). */
export function gated(gate: { promise: Promise<unknown> }, fixture: string) {
  return async () => {
    await gate.promise;
    return loadFixture(`${fixture}.json`).toResponse();
  };
}

/** 조건이 참인 동안은 실패로 답하고, 거짓이 되면 fixture로 답하는 라우트 값(재시도 횟수와 무관하게 "고칠 때"를 정한다). */
export function failWhile(failing: () => boolean, failure: string | 'network', fixture: string) {
  return () => {
    if (!failing()) return loadFixture(`${fixture}.json`).toResponse();
    if (failure === 'network') return Promise.reject(new TypeError('Failed to fetch'));
    return loadFixture(`${failure}.json`).toResponse();
  };
}

/** 게시물 번호 → 지금 보이는 (isLiked, likeCount). */
export const likeOf = (vm: DisplayViewModel, n: number | string): [boolean, number] => {
  const p = ready(vm).posts.find((x) => x.id.endsWith(String(n)));
  if (!p) throw new Error(`${n} 없음`);
  return [p.isLiked, p.likeCount];
};
