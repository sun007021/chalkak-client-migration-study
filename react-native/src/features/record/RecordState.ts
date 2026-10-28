import type { KstDate } from '../../core/time/KstDate';
import type { YearMonth } from '../../core/time/YearMonth';
import type { RecordPhoto } from '../../data/record/RecordModels';

export type RecordErrorKind = 'login-required' | 'invalid-month' | 'generic';

export type RecordState = {
  /** loading: 캐시 없는 달을 불러오는 중(내용 비움). content: 달력(캐시를 보여 주며 revalidating일 수 있다). error: 첫 불러오기 실패. */
  status: 'loading' | 'content' | 'error';
  error: RecordErrorKind | null;
  /** 보고 있는 달. */
  month: YearMonth;
  /** KST 현재 달(D-19). 진입·포그라운드 복귀마다 다시 계산한다. */
  currentMonth: YearMonth;
  today: KstDate;
  /** 서버 월 목록 ∪ 현재 달, 최신순(REQ-REC-002). */
  availableMonths: readonly YearMonth[];
  canGoPrevious: boolean;
  canGoNext: boolean;
  /** 보고 있는 달의 사진(날짜 오름차순, 삭제한 게시물 제외). */
  photos: readonly RecordPhoto[];
  selectedDate: KstDate | null;
  selectedPhoto: RecordPhoto | null;
  revalidating: boolean;
  saving: boolean;
};
