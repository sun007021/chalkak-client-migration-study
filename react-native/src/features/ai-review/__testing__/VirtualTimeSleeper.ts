import { CancelledError } from '../../../core/http/ApiError';
import type { Sleeper } from '../../../core/http/Sleeper';
import type { FakeClock } from '../../../core/time/FakeClock';

type Waiter = { at: number; resolve: () => void; reject: (error: Error) => void };

const macrotask = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * 가짜 시계와 한 몸으로 도는 Sleeper. sleep은 시계가 그만큼 흘러야 풀리고, advance()가 시계를 앞으로 보내며
 * 깨울 순서대로 하나씩 풀고 그 사이에 대기 중이던 비동기 작업이 끝나도록 기다린다. 실제 타이머는 쓰지 않는다.
 */
export class VirtualTimeSleeper implements Sleeper {
  /** sleep(ms) 호출 인자 기록. */
  readonly calls: number[] = [];
  private waiters: Waiter[] = [];

  constructor(private readonly clock: FakeClock) {}

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    this.calls.push(ms);
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(new CancelledError('aborted'));
      const waiter: Waiter = { at: this.clock.now().getTime() + ms, resolve, reject };
      this.waiters.push(waiter);
      signal?.addEventListener(
        'abort',
        () => {
          this.waiters = this.waiters.filter((w) => w !== waiter);
          reject(new CancelledError('aborted'));
        },
        { once: true },
      );
    });
  }

  get waiting(): number {
    return this.waiters.length;
  }

  /** 대기 중인 비동기 작업이 더 진행할 수 없을 때까지 기다린다(시계는 움직이지 않는다). */
  async settle(): Promise<void> {
    for (let i = 0; i < 3; i += 1) await macrotask();
  }

  /** 시계를 ms만큼 앞으로 보낸다. 중간에 깨어난 sleep이 새로 건 sleep도 같은 구간 안이면 이어서 푼다. */
  async advance(ms: number): Promise<void> {
    const target = this.clock.now().getTime() + ms;
    await this.settle();
    for (;;) {
      const due = this.waiters.filter((w) => w.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.waiters = this.waiters.filter((w) => w !== due);
      if (due.at > this.clock.now().getTime()) this.clock.set(new Date(due.at));
      due.resolve();
      await this.settle();
    }
    if (target > this.clock.now().getTime()) this.clock.set(new Date(target));
    await this.settle();
  }
}
