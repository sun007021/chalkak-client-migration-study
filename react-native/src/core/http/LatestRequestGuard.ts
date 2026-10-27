export type GuardedResult<T> = { status: 'applied'; value: T } | { status: 'stale' };

/**
 * 같은 화면의 "마지막 요청만 반영" 가드(REQ-NET-027). run을 다시 부르면 이전 요청의 signal을 abort하고,
 * 이전 요청이 나중에 끝나도 stale로 돌려준다. 취소로 인한 reject는 stale로 삼킨다.
 */
export class LatestRequestGuard {
  private generation = 0;
  private controller: AbortController | null = null;

  async run<T>(task: (signal: AbortSignal) => Promise<T>): Promise<GuardedResult<T>> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const mine = ++this.generation;
    try {
      const value = await task(controller.signal);
      return mine === this.generation ? { status: 'applied', value } : { status: 'stale' };
    } catch (error) {
      if (mine !== this.generation) return { status: 'stale' };
      throw error;
    }
  }

  /** 진행 중 요청을 모두 무효화한다(화면 이탈, 계정 전환). */
  invalidate(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
  }
}
