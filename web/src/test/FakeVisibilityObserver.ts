import type { VisibilityObserverFactory, VisibilityWatch } from '../core/ui/VisibilityObserver';

/** IntersectionObserver 대용. immediate면 관찰을 시작하자마자 "이미 보임"을 알린다(마운트 직후 센티넬이 보이는 경우). */
export class FakeVisibilityObserver {
  readonly targets: Element[] = [];
  disconnects = 0;
  private readonly listeners: (() => void)[] = [];

  constructor(private readonly options: { immediate?: boolean } = {}) {}

  readonly factory: VisibilityObserverFactory = (target, onVisible): VisibilityWatch => {
    this.targets.push(target);
    this.listeners.push(onVisible);
    if (this.options.immediate) onVisible();
    return {
      disconnect: () => {
        this.disconnects += 1;
      },
    };
  };

  /** 가장 최근에 관찰을 시작한 요소가 화면에 들어왔다고 알린다. */
  show(): void {
    this.listeners[this.listeners.length - 1]?.();
  }
}
