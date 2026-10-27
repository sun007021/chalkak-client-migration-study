/** React 없는 상태 컨테이너. 화면은 useViewModel로 구독한다. */
export abstract class ViewModel<S> {
  protected constructor(_initial: S) {}
  get state(): S {
    throw new Error('not implemented');
  }
  /** useSyncExternalStore용. 해제 함수를 돌려준다. */
  subscribe(_listener: () => void): () => void {
    throw new Error('not implemented');
  }
  /** 얕은 병합. 값이 하나도 바뀌지 않으면 state 참조와 구독자 알림을 유지한다. */
  protected setState(_patch: Partial<S>): void {
    throw new Error('not implemented');
  }
  /** 구독자·타이머 정리. */
  dispose(): void {
    throw new Error('not implemented');
  }
}
