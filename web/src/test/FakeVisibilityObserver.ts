import type { VisibilityObserverFactory, VisibilityWatch } from '../core/ui/VisibilityObserver';

/** IntersectionObserver 대용. immediate면 관찰을 시작하자마자 "이미 보임"을 알린다(마운트 직후 센티넬이 보이는 경우). */
export class FakeVisibilityObserver {
  readonly targets: Element[] = [];
  disconnects = 0;
  private readonly listeners: { notify: () => void; disconnected: boolean }[] = [];

  constructor(private readonly options: { immediate?: boolean } = {}) {}

  readonly factory: VisibilityObserverFactory = (target, onVisible): VisibilityWatch => {
    this.targets.push(target);
    const entry = { notify: onVisible, disconnected: false };
    this.listeners.push(entry);
    if (this.options.immediate) onVisible();
    return {
      disconnect: () => {
        entry.disconnected = true;
        this.disconnects += 1;
      },
    };
  };

  /** 가장 최근에 관찰을 시작한 요소가 화면에 들어왔다고 알린다. 이미 관찰을 끝낸(disconnect) 요소는 알리지 않는다(실제 관찰자와 같다). */
  show(): void {
    const live = this.listeners.filter((entry) => !entry.disconnected);
    live[live.length - 1]?.notify();
  }
}
