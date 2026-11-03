import type { ApiClient } from '../../core/net/ApiClient';
import { d } from '../../core/net/decode';
import { InvalidResponseError } from '../../core/net/errors';
import { monthOfDate, compareMonths, monthKey, sameMonth } from './recordMonths';
import type { CalendarMonth, CalendarPost, CalendarStatus, YearMonth } from './recordModels';

const STATUSES: readonly string[] = ['PENDING', 'APPROVED'];
const isCalendarStatus = (value: string): value is CalendarStatus => STATUSES.includes(value);

const validYear = (year: number): boolean => Number.isInteger(year) && year >= 1 && year <= 9999;
const validMonth = (month: number): boolean => Number.isInteger(month) && month >= 1 && month <= 12;

const decodeMonths = d.object({ months: d.array(d.object({ year: d.number(), month: d.number() })) });
const decodeMonthResponse = d.object({
  year: d.number(),
  month: d.number(),
  posts: d.array(d.object({ topicDate: d.string(), postId: d.string(), thumbnailImageUrl: d.string(), status: d.string() })),
});

/**
 * 기록 탭이 쓰는 읽기 API(API §GET calendar, §GET calendar/months). 던지는 것은 ApiClient와 같다.
 * 요청을 만들 수 없는 입력(year가 1~9999 정수가 아님, month가 1~12 정수가 아님)은 요청 없이 RangeError로 거절한다(TC-REC-031).
 */
export class RecordRepository {
  constructor(protected readonly deps: { api: ApiClient }) {}

  /** GET /posts/calendar/months. 최신순·중복 없음으로 정리해 돌려준다(응답이 `[]`여도 오류 아님, TC-REC-002). */
  async fetchMonths(signal?: AbortSignal): Promise<YearMonth[]> {
    const body = await this.deps.api.request({ method: 'GET', path: '/posts/calendar/months', signal }, decodeMonths);
    const byKey = new Map<string, YearMonth>();
    for (const { year, month } of body.months) {
      if (!validYear(year) || !validMonth(month)) throw new InvalidResponseError(`invalid month: ${year}-${month}`);
      byKey.set(monthKey({ year, month }), { year, month });
    }
    return [...byKey.values()].sort((a, b) => compareMonths(b, a));
  }

  /**
   * GET /posts/calendar?year=&month=. 응답 검증(REQ-REC-018): year·month가 요청과 같고, 모든 topicDate가 그 달 안이며, 날짜 중복이 없고,
   * thumbnailImageUrl이 비어 있지 않고, status가 PENDING|APPROVED. 하나라도 어기면 InvalidResponseError. posts는 topicDate 오름차순으로 돌려준다.
   */
  async fetchMonth(ym: YearMonth, signal?: AbortSignal): Promise<CalendarMonth> {
    if (!validYear(ym.year)) throw new RangeError(`invalid year: ${ym.year}`);
    if (!validMonth(ym.month)) throw new RangeError(`invalid month: ${ym.month}`);
    const body = await this.deps.api.request({ method: 'GET', path: '/posts/calendar', query: { year: ym.year, month: ym.month }, signal }, decodeMonthResponse);
    if (body.year !== ym.year || body.month !== ym.month) throw new InvalidResponseError(`month mismatch: ${body.year}-${body.month}`);
    const seen = new Set<string>();
    const posts: CalendarPost[] = [];
    for (const raw of body.posts) {
      const inMonth = monthOfDate(raw.topicDate);
      if (!inMonth || !sameMonth(inMonth, ym)) throw new InvalidResponseError(`date out of month: ${raw.topicDate}`);
      if (seen.has(raw.topicDate)) throw new InvalidResponseError(`duplicate date: ${raw.topicDate}`);
      seen.add(raw.topicDate);
      if (raw.postId.length === 0) throw new InvalidResponseError('empty postId');
      if (raw.thumbnailImageUrl.trim().length === 0) throw new InvalidResponseError('empty thumbnailImageUrl');
      if (!isCalendarStatus(raw.status)) throw new InvalidResponseError(`unknown status: ${raw.status}`);
      posts.push({ postId: raw.postId, topicDate: raw.topicDate, thumbnailImageUrl: raw.thumbnailImageUrl, status: raw.status });
    }
    posts.sort((a, b) => (a.topicDate < b.topicDate ? -1 : 1));
    return { year: ym.year, month: ym.month, posts };
  }
}
