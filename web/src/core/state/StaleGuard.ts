export interface Ticket {
  /** begin() 이후 더 새로운 begin() 또는 invalidate()가 없었으면 true. */
  isCurrent(): boolean;
}

/** 늦게 도착한 응답을 버리는 공용 가드(REQ-NET-027, 계정 전환 포함). */
export class StaleGuard {
  private generation = 0;

  begin(): Ticket {
    const mine = ++this.generation;
    return { isCurrent: () => this.generation === mine };
  }

  /**
   * 새 세대를 열지 않고 "지금 세대"의 티켓을 돌려준다. 같은 세대의 티켓이 여러 개 함께 유효할 수 있고(예: 계정 전환 가드),
   * invalidate()가 한 번이라도 불리면 모두 무효가 된다. begin()과 달리 이전 티켓을 무효화하지 않는다.
   */
  snapshot(): Ticket {
    const mine = this.generation;
    return { isCurrent: () => this.generation === mine };
  }

  /** 진행 중인 모든 티켓을 무효화(계정 전환, 화면 상태 리셋). */
  invalidate(): void {
    this.generation++;
  }
}
