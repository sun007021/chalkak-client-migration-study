import type { ApiClient } from '../../core/http/ApiClient';
import type { YearMonth } from '../../core/time/YearMonth';
import type { RecordMonth } from './RecordModels';

export type RecordRepositoryDeps = { api: ApiClient };

/** 기록 탭 API. 실패는 ApiError 하위 클래스를 그대로 던진다(문구 변환은 ViewModel). */
export class RecordRepository {
  constructor(private readonly deps: RecordRepositoryDeps) {}

  /** GET /posts/calendar/months. 최신순·중복 없음으로 돌려준다(없으면 []). */
  getMonths(signal?: AbortSignal): Promise<YearMonth[]> {
    void this.deps;
    void signal;
    throw new Error('not implemented');
  }

  /**
   * GET /posts/calendar?year&month. REQ-REC-018 검증(월 일치, 날짜 범위, 날짜 중복 없음, 썸네일 비어 있지 않음)을
   * 어기면 InvalidResponseError. PENDING·APPROVED가 아닌 항목은 버린다(TC-REC-014, [가정]).
   */
  getCalendar(month: YearMonth, signal?: AbortSignal): Promise<RecordMonth> {
    void month;
    void signal;
    throw new Error('not implemented');
  }
}
