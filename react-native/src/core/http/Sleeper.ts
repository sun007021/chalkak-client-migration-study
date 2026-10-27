/** 재시도 대기용. 취소되면 CancelledError로 reject한다. 테스트는 가짜로 바꿔 실제로 기다리지 않는다. */
export interface Sleeper {
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}
