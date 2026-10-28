import { FakeClock } from '../../time/FakeClock';
import type { MonotonicClock } from '../MonotonicClock';

/** 벽시계 FakeClock과 독립된 단조 시계. advance로만 흐른다. */
export class FakeMonotonicClock implements MonotonicClock {
  private readonly clock = new FakeClock('2000-01-01T00:00:00.000Z');

  nowMs(): number {
    return this.clock.now().getTime();
  }

  advance(ms: number): void {
    this.clock.advance(ms);
  }
}
