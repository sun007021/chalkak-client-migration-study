import type { KstDate } from './KstDate';
import { utcDate } from './utcDate';

/** KST 연월 값 객체. `KstDate`처럼 생성 시 검증하고 불변이다. 연도는 1~9999. */
export class YearMonth {
  readonly year: number;
  readonly month: number;

  private constructor(year: number, month: number) {
    this.year = year;
    this.month = month;
    Object.freeze(this);
  }

  /** 정수가 아니거나 연도가 1~9999 밖이거나 월이 1~12 밖이면 RangeError. */
  static of(year: number, month: number): YearMonth {
    const valid =
      Number.isInteger(year) &&
      Number.isInteger(month) &&
      year >= 1 &&
      year <= 9999 &&
      month >= 1 &&
      month <= 12;
    if (!valid) throw new RangeError(`invalid year-month: ${year}-${month}`);
    return new YearMonth(year, month);
  }

  static from(date: KstDate): YearMonth {
    return YearMonth.of(date.year, date.month);
  }

  /** 그 달의 일수(윤년 반영). */
  daysInMonth(): number {
    return utcDate(this.year, this.month, 0).getUTCDate();
  }

  /** 음수(이전), 0(같음), 양수(이후) */
  compare(other: YearMonth): number {
    return this.year - other.year || this.month - other.month;
  }

  equals(other: YearMonth): boolean {
    return this.compare(other) === 0;
  }

  /** `yyyy-MM` */
  toString(): string {
    return `${String(this.year).padStart(4, '0')}-${String(this.month).padStart(2, '0')}`;
  }

  toJSON(): string {
    return this.toString();
  }
}
