import type { DateString } from '../../core/time/kst';

/** 연·월(월은 1~12). */
export interface YearMonth {
  year: number;
  month: number;
}

/** 달력에 나오는 상태는 둘뿐이다(REQ-REC-014). 그 밖의 값은 계약 위반이다(REQ-REC-018). */
export type CalendarStatus = 'PENDING' | 'APPROVED';

/** GET /posts/calendar 항목. thumbnailImageUrl은 비어 있지 않다(REQ-REC-018). */
export interface CalendarPost {
  postId: string;
  topicDate: DateString;
  thumbnailImageUrl: string;
  status: CalendarStatus;
}

/** 검증을 통과한 월 응답. posts는 topicDate 오름차순이다(응답 순서와 무관, TC-REC-015). */
export interface CalendarMonth extends YearMonth {
  posts: CalendarPost[];
}
