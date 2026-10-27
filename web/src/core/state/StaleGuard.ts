export interface Ticket {
  /** begin() 이후 더 새로운 begin() 또는 invalidate()가 없었으면 true. */
  isCurrent(): boolean;
}

/** 늦게 도착한 응답을 버리는 공용 가드(REQ-NET-027, 계정 전환 포함). */
export class StaleGuard {
  begin(): Ticket {
    throw new Error('not implemented');
  }
  /** 진행 중인 모든 티켓을 무효화(계정 전환, 화면 상태 리셋). */
  invalidate(): void {
    throw new Error('not implemented');
  }
}
