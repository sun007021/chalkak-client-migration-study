/** KST 달력 날짜 값 객체. 시각·시간대 정보를 갖지 않는다. 구현 예정(스텁). */
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
  static of(_year: number, _month: number, _day: number): KstDate {
    throw new Error('not implemented');
  }

  /** `yyyy-MM-dd`(ASCII, 0 패딩)만 허용한다. 형식이 틀리거나 없는 날짜면 null. */
  static parse(_text: string): KstDate | null {
    throw new Error('not implemented');
  }

  /** `yyyy-MM-dd` */
  toString(): string {
    throw new Error('not implemented');
  }

  plusDays(_days: number): KstDate {
    throw new Error('not implemented');
  }

  /** 음수(이전), 0(같음), 양수(이후) */
  compare(_other: KstDate): number {
    throw new Error('not implemented');
  }

  equals(_other: KstDate): boolean {
    throw new Error('not implemented');
  }

  /** 0=일요일 … 6=토요일 */
  dayOfWeek(): number {
    throw new Error('not implemented');
  }
}
