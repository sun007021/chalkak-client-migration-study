import { FakeClock } from '../../test/FakeClock';
import { DEVICE_TIME_ZONES, withTimeZone } from '../../test/withTimeZone';
import { kstToday } from '../../core/time/kst';
import { computeHomeDates, formatTopicHeaderDate } from './homeDates';

describe('computeHomeDates (REQ-HOME-003, 019, 020)', () => {
  it('TC-HOME-024 오늘 2026-10-27(화): 어제는 10/26, 주는 일요일 10/25부터 토요일 10/31 7칸이고 달은 10월뿐이다', () => {
    expect(computeHomeDates('2026-10-27')).toEqual({
      today: '2026-10-27',
      yesterday: '2026-10-26',
      week: ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'],
      months: [{ year: 2026, month: 10 }],
    });
  });

  it.each([
    ['일요일 2026-11-01', '2026-11-01', '2026-11-01', '2026-11-07', [{ year: 2026, month: 11 }]],
    ['토요일 2026-10-31', '2026-10-31', '2026-10-25', '2026-10-31', [{ year: 2026, month: 10 }]],
  ])('TC-HOME-025 주 경계: 오늘이 %s이면 하루 어긋나지 않는다', (_name, today, first, last, months) => {
    const { week, months: got } = computeHomeDates(today);
    expect([week[0], week[6]]).toEqual([first, last]);
    expect(week).toHaveLength(7);
    expect(got).toEqual(months);
  });

  it('TC-HOME-026 월 경계: 2026-09-30(수)은 9/27~10/3이고 2026-09, 2026-10을 이 순서로 조회한다', () => {
    const { week, months } = computeHomeDates('2026-09-30');
    expect(week).toEqual(['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(months).toEqual([
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
    ]);
  });

  it('TC-HOME-027 연말 경계: 2026-12-31(목)은 12/27~1/2이고 2026-12, 2027-01을 조회하며 칸 순서가 맞다', () => {
    const { week, months } = computeHomeDates('2026-12-31');
    expect(week).toEqual(['2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    expect(months).toEqual([
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ]);
  });

  it('TC-HOME-028 윤년 2028-02-29(화)는 2/27~3/4이고 2028-02, 2028-03을 조회한다', () => {
    const { today, yesterday, week, months } = computeHomeDates('2028-02-29');
    expect(today).toBe('2028-02-29');
    expect(yesterday).toBe('2028-02-28');
    expect([week[0], week[6]]).toEqual(['2028-02-27', '2028-03-04']);
    expect(months).toEqual([
      { year: 2028, month: 2 },
      { year: 2028, month: 3 },
    ]);
  });

  it('REQ-HOME-028 어제는 월·연 경계를 넘는다(3/1 → 2/28, 평년 2027, 1/1 → 12/31)', () => {
    expect(computeHomeDates('2027-03-01').yesterday).toBe('2027-02-28');
    expect(computeHomeDates('2027-01-01').yesterday).toBe('2026-12-31');
    expect(computeHomeDates('2028-03-01').yesterday).toBe('2028-02-29');
  });

  it.each(DEVICE_TIME_ZONES)('TC-HOME-029 api-contract T6: 기기 시간대 %s에서도 UTC 10-26T15:00Z는 KST 10/27 화요일이고 UTC 날짜(10/26)를 쓰지 않는다', (tz) => {
    const dates = withTimeZone(tz, () => computeHomeDates(kstToday(new FakeClock(Date.parse('2026-10-26T15:00:00Z')))));
    expect(dates.today).toBe('2026-10-27');
    expect(dates.yesterday).toBe('2026-10-26');
    expect(dates.week[2]).toBe('2026-10-27'); // 화요일 = 세 번째 칸
  });

  it('api-contract T7: UTC 10-26T14:59:59Z는 아직 KST 10/26이라 오늘은 10/26(월)이다', () => {
    const dates = computeHomeDates(kstToday(new FakeClock(Date.parse('2026-10-26T14:59:59Z'))));
    expect(dates.today).toBe('2026-10-26');
    expect(dates.week[1]).toBe('2026-10-26');
  });

  it('FIRST_TOPIC_DATE(2026-09-17) 이전 날짜 칸도 계산은 정상이다(TC-HOME-030)', () => {
    expect(computeHomeDates('2026-09-17').week).toEqual(['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19']);
    expect(computeHomeDates('2026-09-17').yesterday).toBe('2026-09-16');
  });
});

describe('formatTopicHeaderDate (REQ-HOME-004)', () => {
  it.each([
    ['2026-10-27', '10월 27일'],
    ['2026-09-03', '9월 3일'],
    ['2027-01-01', '1월 1일'],
    ['2028-02-29', '2월 29일'],
  ])('TC-HOME-053 %s → %s (0 채움 없음, 기기 시간대와 무관)', (date, expected) => {
    for (const tz of DEVICE_TIME_ZONES) expect(withTimeZone(tz, () => formatTopicHeaderDate(date))).toBe(expected);
  });
});
