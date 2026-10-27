/** refresh 구간("재읽기 → refresh → 비교 후 쓰기") 전체를 한 번에 하나만 실행하게 하는 락. 여러 탭이 같은 refresh token을 두 번 보내면 서버가 재사용으로 보고 세션을 폐기한다. */
export interface RefreshLock {
  withLock<T>(fn: () => Promise<T>): Promise<T>;
}

/** 프로세스(탭) 안 뮤텍스. 요청 순서대로 실행한다. fn이 던져도 다음 대기자는 실행된다. */
export class InProcessRefreshLock implements RefreshLock {
  private tail: Promise<unknown> = Promise.resolve();

  withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    this.tail = run.catch(() => {});
    return run;
  }
}

export const REFRESH_LOCK_NAME = 'chalkak-auth-refresh';

type LockManagerLike = { request<T>(name: string, callback: () => Promise<T>): Promise<T> };

/** Web Locks API로 같은 출처의 모든 탭을 직렬화한다. 지원하지 않는 환경이면 탭 안 뮤텍스로 폴백한다. */
export class WebLocksRefreshLock implements RefreshLock {
  constructor(
    private readonly locks: LockManagerLike | undefined = (globalThis.navigator as { locks?: LockManagerLike } | undefined)?.locks,
    private readonly fallback: RefreshLock = new InProcessRefreshLock(),
  ) {}

  withLock<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.locks) return this.fallback.withLock(fn);
    return this.locks.request(REFRESH_LOCK_NAME, fn);
  }
}
