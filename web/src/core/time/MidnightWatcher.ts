import type { Clock } from './Clock';
import type { DateString } from './kst';

/**
 * KST 날짜 변경 감지(REQ-TIME-007, D-19). start()하면 다음 KST 자정까지 clock.sleep으로 기다렸다가 onDateChanged(새 날짜)를 부르고 다시 다음 자정을 기다린다.
 * checkNow()는 포그라운드 복귀 때 호출하며 마지막으로 알린 날짜와 다르면 한 번만 알린다.
 */
export class MidnightWatcher {
  constructor(_deps: { clock: Clock; onDateChanged: (today: DateString) => void }) {}
  start(): void {
    throw new Error('not implemented');
  }
  stop(): void {
    throw new Error('not implemented');
  }
  checkNow(): void {
    throw new Error('not implemented');
  }
}
