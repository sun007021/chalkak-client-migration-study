import type { DateString } from '../../core/time/kst';
import type { PostSummary } from './homeModels';

/**
 * 홈이 화면을 바꾸는 유일한 통로. Web 구현(RouterHomeNavigator)은 react-router navigate로 아래 경로·state를 만든다.
 * 전시·게시물 상세·알림함·AI 시트 화면은 다음 PR이라 경로 계약만 정한다(app/paths.ts의 displayPath/recordPath/feedPath).
 */
export interface HomeNavigator {
  /** 게시물 상세(피드). seed는 목록 항목이라 상세 응답 전에도 이미지·좋아요를 보여 준다. */
  openPostDetail(target: { postId: string; seed: PostSummary }): void;
  /** 알림함. */
  openNotifications(): void;
  /** 전시 탭을 해당 날짜의 인기순으로 연다(REQ-HOME-031). */
  openDisplayPopular(date: DateString): void;
  /** 기록 탭. selectedDate가 있으면 그 날짜의 달을 불러와 선택한다(REQ-HOME-023). */
  openRecord(selectedDate: DateString | null): void;
  /** 게시물 상세 + AI 피드백 시트(ai-review PR). */
  openAiReview(postId: string): void;
}
