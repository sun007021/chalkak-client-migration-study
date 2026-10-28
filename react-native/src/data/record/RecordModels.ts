import type { KstDate } from '../../core/time/KstDate';
import type { YearMonth } from '../../core/time/YearMonth';

/** 달력에 나오는 상태는 PENDING·APPROVED뿐이다(REQ-REC-014). */
export type RecordPhotoStatus = 'PENDING' | 'APPROVED';

export type RecordPhoto = {
  postId: string;
  /** 서버가 주는 주제 날짜 그대로(시간대 변환 없음, REQ-REC-012). */
  date: KstDate;
  thumbnailUrl: string;
  status: RecordPhotoStatus;
};

/** 검증을 통과한 한 달치 기록. photos는 날짜 오름차순이다. */
export type RecordMonth = { month: YearMonth; photos: readonly RecordPhoto[] };
