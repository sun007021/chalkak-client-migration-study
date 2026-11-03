import { CancelledError } from '../http/ApiError';
import type { Sleeper } from '../http/Sleeper';
import type { Clock } from './Clock';
import { KST_OFFSET_MS, todayKst } from './kst';

const DAY_MS = 24 * 60 * 60 * 1000;
/** 날짜가 안 바뀌었는데 깨어나는 일(타이머 오차)이 이만큼 연달아 나면 포기한다. 포그라운드 복귀 검사가 대신한다. */
const MAX_EARLY_WAKES = 5;

/** 지금부터 다음 KST 자정(00:00:00.000)까지 남은 밀리초. 항상 1 이상이다. */
export function msUntilNextKstMidnight(clock: Clock): number {
  const kstMs = clock.now().getTime() + KST_OFFSET_MS;
  return DAY_MS - (((kstMs % DAY_MS) + DAY_MS) % DAY_MS);
}

/**
 * KST 자정을 넘길 때마다 콜백을 부른다(REQ-TIME-007). 주입한 Clock·Sleeper만 쓰므로 테스트는 가상 시계로 전진시킨다.
 * 한 번 울린 뒤에는 다음 자정을 다시 건다. 반환된 함수를 부르면 대기를 취소한다.
 */
export class MidnightScheduler {
  constructor(private readonly deps: { clock: Clock; sleeper: Sleeper }) {}

  watch(onMidnight: () => void): () => void {
    const controller = new AbortController();
    void this.run(onMidnight, controller.signal);
    return () => controller.abort();
  }

  private async run(onMidnight: () => void, signal: AbortSignal): Promise<void> {
    const { clock, sleeper } = this.deps;
    let earlyWakes = 0;
    try {
      while (!signal.aborted) {
        const armedOn = todayKst(clock);
        await sleeper.sleep(msUntilNextKstMidnight(clock), signal);
        if (signal.aborted) return;
        if (todayKst(clock).equals(armedOn)) {
          earlyWakes += 1;
          if (earlyWakes >= MAX_EARLY_WAKES) return;
          continue;
        }
        earlyWakes = 0;
        onMidnight();
      }
    } catch (error) {
      if (!(error instanceof CancelledError)) throw error;
    }
  }
}
