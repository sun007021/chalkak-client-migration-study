/** 시스템 시계/타이머는 이 인터페이스 뒤에서만 쓴다(REQ-TIME-002). */
export interface Clock {
  /** 벽시계(Unix epoch ms). 사용자가 기기 시각을 바꾸면 따라 움직인다. */
  nowMs(): number;
  /** 단조 시계(ms). 기기 시각 변경의 영향을 받지 않는다. */
  monotonicMs(): number;
  /** ms 후에 이행. signal이 abort되면 타이머를 정리하고 AbortError로 거절한다. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}
