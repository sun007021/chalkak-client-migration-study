import type { Clock } from './Clock';

/** 테스트용 가짜 시계. 실제로 기다리지 않고 set/advance로 시각을 옮긴다. */
export class FakeClock implements Clock {
  private current: Date;

  constructor(initial: Date | string) {
    this.current = FakeClock.toDate(initial);
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  set(instant: Date | string): void {
    this.current = FakeClock.toDate(instant);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  private static toDate(value: Date | string): Date {
    const date = typeof value === 'string' ? new Date(value) : new Date(value.getTime());
    if (Number.isNaN(date.getTime())) {
      throw new RangeError(`Invalid instant: ${String(value)}`);
    }
    return date;
  }
}
