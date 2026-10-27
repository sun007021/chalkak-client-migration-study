export type GuardedResult<T> = { status: 'applied'; value: T } | { status: 'stale' };

/**
 * 같은 화면의 "마지막 요청만 반영" 가드(REQ-NET-027). run을 다시 부르면 이전 요청의 signal을 abort하고,
 * 이전 요청이 나중에 끝나도 stale로 돌려준다. 취소로 인한 reject는 stale로 삼킨다.
 */
export class LatestRequestGuard {
  run<T>(_task: (signal: AbortSignal) => Promise<T>): Promise<GuardedResult<T>> {
    throw new Error('not implemented');
  }

  /** 진행 중 요청을 모두 무효화한다(화면 이탈, 계정 전환). */
  invalidate(): void {
    throw new Error('not implemented');
  }
}
