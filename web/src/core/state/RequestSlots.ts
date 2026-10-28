import { StaleGuard } from './StaleGuard';

/** 요청 한 건의 취소 신호와 "아직 최신인가" 판정. */
export interface RequestPass {
  signal: AbortSignal;
  isCurrent(): boolean;
}

/**
 * 이름 붙은 요청 칸. 같은 칸에서 새 요청을 시작하면 이전 요청은 취소(AbortSignal)되고 응답이 버려진다(StaleGuard).
 * 칸끼리는 서로 영향이 없다(섹션 독립 로드). cancelAll은 모든 칸의 진행 중 요청을 무효화한다.
 */
export class RequestSlots<K extends string> {
  private readonly guards = new Map<K, StaleGuard>();
  private readonly controllers = new Map<K, AbortController>();

  constructor(private readonly isClosed: () => boolean = () => false) {}

  begin(key: K): RequestPass {
    this.controllers.get(key)?.abort();
    const controller = new AbortController();
    this.controllers.set(key, controller);
    const guard = this.guards.get(key) ?? new StaleGuard();
    this.guards.set(key, guard);
    const ticket = guard.begin();
    return { signal: controller.signal, isCurrent: () => !this.isClosed() && ticket.isCurrent() };
  }

  cancelAll(): void {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
    for (const guard of this.guards.values()) guard.invalidate();
  }
}
