import { isCancellation } from '../net/errors';
import type { Logger } from '../net/Logger';
import type { Clock } from './Clock';
import { kstToday, nextKstMidnight } from './kst';
import type { DateString } from './kst';

/**
 * KST 날짜 변경 감지(REQ-TIME-007, D-19). start()하면 다음 KST 자정까지 clock.sleep으로 기다렸다가 onDateChanged(새 날짜)를 부르고 다시 다음 자정을 기다린다.
 * checkNow()는 포그라운드 복귀 때 호출하며 마지막으로 알린 날짜와 다르면 한 번만 알린다.
 */
export class MidnightWatcher {
  private lastDate: DateString | null = null;
  private abort: AbortController | null = null;

  constructor(private readonly deps: { clock: Clock; onDateChanged: (today: DateString) => void; logger?: Logger }) {}

  start(): void {
    this.stop();
    this.lastDate = kstToday(this.deps.clock);
    this.arm();
  }

  stop(): void {
    this.abort?.abort();
    this.abort = null;
  }

  checkNow(): void {
    const wasRunning = this.abort !== null;
    this.notifyIfChanged();
    // 기기 시각이 바뀌었을 수 있으니 실행 중이면 남은 대기 시간을 다시 계산한다.
    if (wasRunning) {
      this.stop();
      this.arm();
    }
  }

  private notifyIfChanged(): void {
    const today = kstToday(this.deps.clock);
    if (today === this.lastDate) return;
    this.lastDate = today;
    try {
      this.deps.onDateChanged(today);
    } catch (error) {
      // 콜백 예외로 감시 자체가 멈추면 이후 자정을 모두 놓친다. 기록만 하고 계속한다.
      this.deps.logger?.log('error', 'MidnightWatcher onDateChanged threw', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private arm(): void {
    const abort = new AbortController();
    this.abort = abort;
    void this.loop(abort.signal);
  }

  private async loop(signal: AbortSignal): Promise<void> {
    const { clock } = this.deps;
    while (!signal.aborted) {
      try {
        await clock.sleep(nextKstMidnight(clock.nowMs()) - clock.nowMs(), signal);
      } catch (error) {
        // stop()에 의한 취소(AbortError)만 정상 종료다. 그 밖의 예외는 기록하고 멈춘다(바쁜 루프 방지).
        if (!isCancellation(error)) this.deps.logger?.log('error', 'MidnightWatcher sleep failed', { error: error instanceof Error ? error.message : String(error) });
        return;
      }
      this.notifyIfChanged();
    }
  }
}
