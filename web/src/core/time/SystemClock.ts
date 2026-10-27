import type { Clock } from './Clock';

/** 실제 시스템 시계. 시스템 시계를 직접 부르는 유일한 파일(TC-TIME-029 허용 목록). */
export class SystemClock implements Clock {
  nowMs(): number {
    throw new Error('not implemented');
  }
  monotonicMs(): number {
    throw new Error('not implemented');
  }
  sleep(_ms: number, _signal?: AbortSignal): Promise<void> {
    throw new Error('not implemented');
  }
}
