import type { Clock } from './Clock';

interface Timer {
  at: number;
  seq: number;
  resolve: () => void;
  reject: (e: unknown) => void;
  cleanup: () => void;
}

function abortError(): Error {
  return new DOMException('The operation was aborted.', 'AbortError');
}

/** 테스트용 가짜 시계. 실제로 기다리지 않고 advance()로 가상 시간만 전진한다. */
export class FakeClock implements Clock {
  private wall: number;
  private mono = 0;
  private seq = 0;
  private timers: Timer[] = [];

  constructor(startWallMs: number = Date.UTC(2026, 9, 27, 3, 0, 0)) {
    this.wall = startWallMs;
  }

  nowMs(): number {
    return this.wall;
  }

  monotonicMs(): number {
    return this.mono;
  }

  /** 단조 시계는 그대로 두고 벽시계만 바꾼다(사용자가 기기 시각을 바꾼 상황). */
  setWallClock(ms: number): void {
    this.wall = ms;
  }

  get pendingTimers(): number {
    return this.timers.length;
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise<void>((resolve, reject) => {
      const timer: Timer = {
        at: this.mono + Math.max(0, ms),
        seq: this.seq++,
        resolve,
        reject,
        cleanup: () => signal?.removeEventListener('abort', onAbort),
      };
      const onAbort = () => {
        this.timers = this.timers.filter((t) => t !== timer);
        timer.cleanup();
        reject(abortError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.timers.push(timer);
    });
  }

  /** 가상 시간을 ms만큼 전진하며 도래한 타이머를 순서대로 실행한다. 그때마다 대기 중인 마이크로태스크를 비운다. */
  async advance(ms: number): Promise<void> {
    const target = this.mono + ms;
    await flushAsync();
    for (;;) {
      const due = this.timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (!due) break;
      this.wall += Math.max(0, due.at - this.mono);
      this.mono = due.at;
      this.timers = this.timers.filter((t) => t !== due);
      due.cleanup();
      due.resolve();
      await flushAsync();
    }
    this.wall += target - this.mono;
    this.mono = target;
    await flushAsync();
  }
}

/** 진행 중인 Promise 체인(fetch fake, Response.text 포함)이 모두 소화될 때까지 양보한다. 실제 타이머는 쓰지 않는 vi.useFakeTimers 환경에서도 동작하도록 MessageChannel을 쓴다. */
export function flushAsync(): Promise<void> {
  return new Promise<void>((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(null);
  });
}
