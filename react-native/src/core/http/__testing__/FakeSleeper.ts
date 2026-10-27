import { CancelledError } from '../ApiError';
import type { Sleeper } from '../Sleeper';

/**
 * 실제로 기다리지 않는 Sleeper. 기본은 즉시 resolve하고 호출 ms를 기록한다.
 * manual이면 release()를 부를 때까지 대기하고, signal이 abort되면 CancelledError로 reject한다.
 */
export class FakeSleeper implements Sleeper {
  readonly calls: number[] = [];
  private pending: (() => void)[] = [];

  constructor(private readonly manual = false) {}

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    this.calls.push(ms);
    if (!this.manual) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(new CancelledError('aborted'));
      const done = () => resolve();
      this.pending.push(done);
      signal?.addEventListener('abort', () => reject(new CancelledError('aborted')), {
        once: true,
      });
    });
  }

  get waiting(): number {
    return this.pending.length;
  }

  release(): void {
    const all = this.pending;
    this.pending = [];
    all.forEach((fn) => fn());
  }
}
