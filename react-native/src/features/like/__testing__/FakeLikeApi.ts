import { deferred } from '../../../core/http/__testing__/FakeTransport';
import type { LikeApi, LikeResult } from '../../../data/like/LikeRepository';

type Call = {
  index: number;
  kind: 'like' | 'unlike';
  postId: string;
  settled: boolean;
  signal?: AbortSignal;
  gate: ReturnType<typeof deferred<LikeResult>>;
};

/**
 * 응답 시점을 테스트가 정하는 가짜 서버. 요청은 대기시키고 `succeed(i)`/`fail(i, error)`로 끝낸다.
 * 서버 상태(좋아요 여부·개수)를 들고 있어 성공 응답은 그 상태에서 계산한다.
 */
export class FakeLikeApi implements LikeApi {
  readonly calls: Call[] = [];
  private readonly server = new Map<string, { likeCount: number; isLiked: boolean }>();
  /** 동시에 진행 중이던 요청 수의 최댓값(게시물별). */
  private readonly inFlight = new Map<string, number>();
  maxInFlightPerPost = 0;

  setServer(postId: string, likeCount: number, isLiked: boolean): this {
    this.server.set(postId, { likeCount, isLiked });
    return this;
  }

  serverState(postId: string): { likeCount: number; isLiked: boolean } {
    return this.server.get(postId) ?? { likeCount: 0, isLiked: false };
  }

  like(postId: string, signal?: AbortSignal): Promise<LikeResult> {
    return this.start('like', postId, signal);
  }

  unlike(postId: string, signal?: AbortSignal): Promise<LikeResult> {
    return this.start('unlike', postId, signal);
  }

  /** 아직 끝나지 않은 요청 인덱스들. */
  get pending(): number[] {
    return this.calls.filter((c) => !c.settled).map((c) => c.index);
  }

  /** 서버 상태를 바꾸고 성공 응답을 돌려준다. `override`로 응답 값을 강제할 수 있다(다른 사용자의 동시 좋아요 등). */
  succeed(index: number, override?: Partial<LikeResult>): void {
    const call = this.calls[index];
    const state = { ...this.serverState(call.postId) };
    const wantLiked = call.kind === 'like';
    if (state.isLiked !== wantLiked) state.likeCount += wantLiked ? 1 : -1;
    state.isLiked = wantLiked;
    this.server.set(call.postId, state);
    this.finish(call);
    call.gate.resolve({ postId: call.postId, ...state, ...override });
  }

  fail(index: number, error: unknown): void {
    const call = this.calls[index];
    this.finish(call);
    call.gate.reject(error);
  }

  private start(kind: Call['kind'], postId: string, signal?: AbortSignal): Promise<LikeResult> {
    const call: Call = {
      index: this.calls.length,
      kind,
      postId,
      settled: false,
      signal,
      gate: deferred<LikeResult>(),
    };
    this.calls.push(call);
    const now = (this.inFlight.get(postId) ?? 0) + 1;
    this.inFlight.set(postId, now);
    this.maxInFlightPerPost = Math.max(this.maxInFlightPerPost, now);
    return call.gate.promise;
  }

  private finish(call: Call): void {
    call.settled = true;
    this.inFlight.set(call.postId, (this.inFlight.get(call.postId) ?? 1) - 1);
  }
}
