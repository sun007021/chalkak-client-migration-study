import type { KstDate } from '../../core/time/KstDate';

/** 기록이 화면을 바꾸는 유일한 통로. */
export interface RecordNavigator {
  /** 내 게시물 상세(entry='mine')로 연다. 썸네일을 함께 넘겨 응답 전에 미리 보여 준다(REQ-REC-034). */
  openPostDetail(target: { postId: string; thumbnailUrl: string }): void;
  /** 전시를 그 날짜로 연다. 뒤로 가면 기록으로 돌아온다(REQ-REC-035). */
  openDisplay(date: KstDate): void;
}
