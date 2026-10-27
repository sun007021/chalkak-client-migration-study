import type { Clock } from '../../time/Clock';

export class FakeClock implements Clock {
  constructor(private current: Date = new Date('2026-10-27T00:00:00.000Z')) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
