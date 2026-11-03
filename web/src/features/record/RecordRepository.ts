import type { ApiClient } from '../../core/net/ApiClient';
import type { CalendarMonth, YearMonth } from './recordModels';

const NOT_IMPLEMENTED = 'not implemented';

/**
 * 기록 탭이 쓰는 읽기 API(API §GET calendar, §GET calendar/months). 던지는 것은 ApiClient와 같다.
 * 요청을 만들 수 없는 입력(year가 1~9999 정수가 아님, month가 1~12 정수가 아님)은 요청 없이 RangeError로 거절한다(TC-REC-031).
 */
export class RecordRepository {
  constructor(protected readonly deps: { api: ApiClient }) {}

  /** GET /posts/calendar/months. 최신순·중복 없음으로 정리해 돌려준다(응답이 `[]`여도 오류 아님, TC-REC-002). */
  fetchMonths(_signal?: AbortSignal): Promise<YearMonth[]> {
    throw new Error(NOT_IMPLEMENTED);
  }

  /**
   * GET /posts/calendar?year=&month=. 응답 검증(REQ-REC-018): year·month가 요청과 같고, 모든 topicDate가 그 달 안이며, 날짜 중복이 없고,
   * thumbnailImageUrl이 비어 있지 않고, status가 PENDING|APPROVED. 하나라도 어기면 InvalidResponseError. posts는 topicDate 오름차순으로 돌려준다.
   */
  fetchMonth(_ym: YearMonth, _signal?: AbortSignal): Promise<CalendarMonth> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
