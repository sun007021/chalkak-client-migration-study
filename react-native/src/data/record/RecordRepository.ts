import type { ApiClient } from '../../core/http/ApiClient';
import type { KstDate } from '../../core/time/KstDate';
import { YearMonth } from '../../core/time/YearMonth';
import { asArray, asObject, kstDate, nonNegInt, str, type Obj } from '../decode';
import type { RecordMonth, RecordPhoto, RecordPhotoStatus } from './RecordModels';

export type RecordRepositoryDeps = { api: ApiClient };

const STATUSES: readonly RecordPhotoStatus[] = ['PENDING', 'APPROVED'];

/** 기록 탭 API. 실패는 ApiError 하위 클래스를 그대로 던진다(문구 변환은 ViewModel). */
export class RecordRepository {
  constructor(private readonly deps: RecordRepositoryDeps) {}

  /** GET /posts/calendar/months. 최신순·중복 없음으로 돌려준다(없으면 []). */
  getMonths(signal?: AbortSignal): Promise<YearMonth[]> {
    return this.deps.api.requestJson(
      { method: 'GET', path: '/posts/calendar/months', signal },
      decodeMonths,
    );
  }

  /**
   * GET /posts/calendar?year&month. REQ-REC-018 검증(월 일치, 날짜 범위, 날짜 중복 없음, 썸네일 비어 있지 않음)을
   * 어기면 InvalidResponseError(디코더가 던지면 ApiClient가 바꾼다). PENDING·APPROVED가 아닌 항목은 항목만 버린다
   * (spec의 "전체 계약 위반" 대신 항목 단위로 버리는 것은 팀장 결정 / TC-REC-014).
   */
  getCalendar(month: YearMonth, signal?: AbortSignal): Promise<RecordMonth> {
    return this.deps.api.requestJson(
      {
        method: 'GET',
        path: '/posts/calendar',
        query: { year: month.year, month: month.month },
        signal,
      },
      (raw) => decodeMonth(raw, month),
    );
  }
}

function decodeMonths(raw: unknown): YearMonth[] {
  const o = asObject(raw, 'calendar months');
  const unique = new Map<string, YearMonth>();
  for (const item of asArray(o.months, 'months')) {
    const entry = asObject(item, 'month');
    // YearMonth.of가 범위를 어기면 RangeError -> 계약 위반.
    const month = YearMonth.of(nonNegInt(entry, 'year'), nonNegInt(entry, 'month'));
    unique.set(month.toString(), month);
  }
  return [...unique.values()].sort((a, b) => b.compare(a));
}

function decodeMonth(raw: unknown, requested: YearMonth): RecordMonth {
  const o = asObject(raw, 'calendar');
  const responded = YearMonth.of(nonNegInt(o, 'year'), nonNegInt(o, 'month'));
  if (!responded.equals(requested)) throw new Error('calendar month differs from the request');
  const seen = new Set<string>();
  const photos: RecordPhoto[] = [];
  for (const item of asArray(o.posts, 'posts')) {
    const entry = asObject(item, 'calendar entry');
    const date = kstDate(entry, 'topicDate');
    if (!YearMonth.from(date).equals(requested)) throw new Error('topicDate is outside the month');
    if (seen.has(date.toString())) throw new Error('duplicate topicDate');
    seen.add(date.toString());
    const thumbnailUrl = str(entry, 'thumbnailImageUrl');
    const status = statusOf(entry);
    if (status === null) continue;
    photos.push({ postId: str(entry, 'postId'), date, thumbnailUrl, status });
  }
  photos.sort((a, b) => compareDates(a.date, b.date));
  return { month: requested, photos };
}

function statusOf(entry: Obj): RecordPhotoStatus | null {
  const value = entry.status;
  return STATUSES.find((s) => s === value) ?? null;
}

function compareDates(a: KstDate, b: KstDate): number {
  return a.toString() < b.toString() ? -1 : a.toString() > b.toString() ? 1 : 0;
}
