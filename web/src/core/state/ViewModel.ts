/** React 없는 상태 컨테이너. 화면은 useViewModel로 구독한다. */
export abstract class ViewModel<S> {
  private current: S;
  private readonly listeners = new Set<() => void>();
  private disposed = false;

  protected constructor(initial: S) {
    this.current = initial;
  }

  get state(): S {
    return this.current;
  }

  /** useSyncExternalStore용. 해제 함수를 돌려준다. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 얕은 병합. 값이 하나도 바뀌지 않으면 state 참조와 구독자 알림을 유지한다. */
  protected setState(patch: Partial<S>): void {
    const changed = (Object.keys(patch) as (keyof S)[]).some((key) => !Object.is(patch[key], this.current[key]));
    if (!changed) return;
    this.current = { ...this.current, ...patch };
    if (this.disposed) return;
    for (const listener of [...this.listeners]) listener();
  }

  /** 구독자·타이머 정리. */
  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }
}
