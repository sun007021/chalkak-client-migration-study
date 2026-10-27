/** KST 달력 날짜 값 객체. 시각·시간대 정보를 갖지 않는다. */
export class KstDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;

  private constructor(year: number, month: number, day: number) {
    this.year = year;
    this.month = month;
    this.day = day;
  }

  /** 존재하지 않는 날짜(2027-02-29, 13월 등)는 RangeError. */
  static of(year: number, month: number, day: number): KstDate {
    const date = KstDate.create(year, month, day);
    if (!date) throw new RangeError(`invalid KST date: ${year}-${month}-${day}`);
    return date;
  }

  /** `yyyy-MM-dd`(ASCII, 0 패딩)만 허용한다. 형식이 틀리거나 없는 날짜면 null. */
  static parse(text: string): KstDate | null {
    const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(text);
    if (!match) return null;
    return KstDate.create(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  // 달력에 실제로 존재하는 날짜일 때만 만든다. UTC 산술로 왕복 검증하므로 기기 시간대와 무관하다.
  private static create(year: number, month: number, day: number): KstDate | null {
    const probe = new Date(Date.UTC(year, month - 1, day));
    const exists =
      probe.getUTCFullYear() === year &&
      probe.getUTCMonth() === month - 1 &&
      probe.getUTCDate() === day;
    return exists ? new KstDate(year, month, day) : null;
  }

  private toUtcMidnight(): Date {
    return new Date(Date.UTC(this.year, this.month - 1, this.day));
  }

  /** `yyyy-MM-dd` */
  toString(): string {
    return `${pad(this.year, 4)}-${pad(this.month, 2)}-${pad(this.day, 2)}`;
  }

  plusDays(days: number): KstDate {
    const moved = new Date(Date.UTC(this.year, this.month - 1, this.day + days));
    return new KstDate(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
  }

  /** 음수(이전), 0(같음), 양수(이후) */
  compare(other: KstDate): number {
    return this.year - other.year || this.month - other.month || this.day - other.day;
  }

  equals(other: KstDate): boolean {
    return this.compare(other) === 0;
  }

  /** 0=일요일 … 6=토요일 */
  dayOfWeek(): number {
    return this.toUtcMidnight().getUTCDay();
  }
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}
