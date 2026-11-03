import { deferred } from './deferred';
import { json } from './fixtureRouter';
import { settle } from './homeHarness';
import type { PostHarness } from './postHarness';
import { likeBody, likeKey } from './postRoutes';
import type { LikeValue } from '../features/post/postModels';

export interface LikeRequest {
  method: 'PUT' | 'DELETE';
  settled: boolean;
}

/**
 * 한 게시물의 좋아요 가짜 서버. 요청은 테스트가 끝낼 때까지 붙잡아 두고(응답 지연·순서 재현) 서버 상태(isLiked, likeCount)를 갖는다.
 * succeed는 PUT/DELETE의 멱등 규칙대로 서버 상태를 바꾸고 200으로 끝낸다. invalid는 postId가 다른 200(= 계약 위반, 재시도 없이 실패 처리)이다.
 */
export function createLikeServer(h: Pick<PostHarness, 'router'>, postId: string, initial: LikeValue = { isLiked: false, likeCount: 10 }) {
  const state: LikeValue = { ...initial };
  const queue: { method: 'PUT' | 'DELETE'; gate: ReturnType<typeof deferred<Response>> }[] = [];
  const requests: LikeRequest[] = [];
  const server = {
    state,
    requests,
    /** 응답 대기 중인 요청 수. */
    get inFlight(): number {
      return queue.length;
    },
    /** 지금까지 동시에 대기한 요청 수의 최댓값. */
    maxInFlight: 0,
    /** 보낸 요청의 메서드를 순서대로. */
    get methods(): string[] {
      return requests.map((r) => r.method);
    },
    async succeed(): Promise<void> {
      await settle(); // 요청은 인증 준비(auth.prepare) 뒤 비동기로 나간다
      const next = queue.shift();
      if (!next) throw new Error('대기 중인 요청이 없다');
      if (next.method === 'PUT' && !state.isLiked) {
        state.isLiked = true;
        state.likeCount += 1;
      } else if (next.method === 'DELETE' && state.isLiked) {
        state.isLiked = false;
        state.likeCount = Math.max(0, state.likeCount - 1);
      }
      requests[requests.indexOf(requests.find((r) => !r.settled)!)]!.settled = true;
      next.gate.resolve(json(200, likeBody(postId, state.likeCount, state.isLiked)));
      await settle();
    },
    /** 서버 상태를 바꾸지 않고 응답만 보낸다(postId·값은 지정). */
    async respondWith(response: Response): Promise<void> {
      await settle();
      const next = queue.shift();
      if (!next) throw new Error('대기 중인 요청이 없다');
      requests[requests.indexOf(requests.find((r) => !r.settled)!)]!.settled = true;
      next.gate.resolve(response);
      await settle();
    },
    /** 계약 위반 응답(postId 불일치): 재시도 없이 실패한다. */
    invalid(): Promise<void> {
      return server.respondWith(json(200, likeBody('99999999-9999-4999-8999-999999999999', 1, true)));
    },
    /** 대기 중인 요청을 모두 성공으로 끝낸다. */
    async drain(): Promise<void> {
      while (queue.length > 0) await server.succeed();
    },
  };
  const hold = (method: 'PUT' | 'DELETE') => () => {
    const gate = deferred<Response>();
    queue.push({ method, gate });
    requests.push({ method, settled: false });
    server.maxInFlight = Math.max(server.maxInFlight, queue.length);
    return gate.promise;
  };
  h.router.set(likeKey('PUT', postId), hold('PUT'));
  h.router.set(likeKey('DELETE', postId), hold('DELETE'));
  return server;
}

export type LikeServer = ReturnType<typeof createLikeServer>;
