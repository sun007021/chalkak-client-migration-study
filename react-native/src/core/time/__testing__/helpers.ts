import { KstDate } from '../KstDate';

export const HOUR = 3_600_000;

/** 테스트용 `yyyy-MM-dd` -> KstDate. 잘못된 fixture면 바로 실패한다. */
export const d = (text: string): KstDate => {
  const parsed = KstDate.parse(text);
  if (!parsed) throw new Error(`bad fixture date ${text}`);
  return parsed;
};

export const ymd = (dates: readonly KstDate[]): string[] => dates.map((x) => x.toString());

/** 구현과 독립된 정답: 순간 + 9시간의 UTC 달력 날짜. */
export const oracleKstDate = (instant: Date): string =>
  new Date(instant.getTime() + 9 * HOUR).toISOString().slice(0, 10);

/** 로캘 의존 API를 쓰면 실패하도록 만드는 환경(아랍어·태국어·페르시아어 로캘 기기 모사). */
export function withHostileLocale(run: () => void): void {
  const spies = [
    jest.spyOn(Date.prototype, 'toLocaleString').mockImplementation(() => '٢٠٢٦/١٠/٢٧'),
    jest.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(() => '٢٥٦٩/๑๐/๒๗'),
    jest.spyOn(Date.prototype, 'toLocaleTimeString').mockImplementation(() => '۱۴:۰۰'),
    // format은 접근자 프로퍼티라 getter를 가로챈다.
    jest
      .spyOn(Intl.DateTimeFormat.prototype as { format: unknown }, 'format', 'get')
      .mockImplementation(() => () => '٢٠٢٦-١٠-٢٧'),
  ];
  try {
    run();
  } finally {
    spies.forEach((spy) => spy.mockRestore());
  }
}
