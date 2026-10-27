/**
 * UTC 자정의 Date. `Date.UTC(y, ...)`는 0~99년을 1900년대로 해석하므로 setUTCFullYear로 만든다.
 * month는 1 기반이 아니라 `Date`와 같은 0 기반이고, 범위를 넘으면 `Date`처럼 이월된다.
 */
export function utcDate(year: number, monthIndex: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, monthIndex, day);
  return date;
}
