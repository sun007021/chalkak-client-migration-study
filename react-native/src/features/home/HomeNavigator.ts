import type { PostSummary } from '../../data/post/PostModels';
import type { KstDate } from '../../core/time/KstDate';

/** 홈이 화면을 바꾸는 유일한 통로. 구현은 내비게이션 PR이 맡고 테스트는 Fake를 쓴다. */
export interface HomeNavigator {
  /** 업로드 진입 게이트(D-14). 게스트·정지 판단은 홈이 끝낸 뒤에만 부른다. */
  openUploadGate(): void;
  /** 게시물 상세(피드). seed가 있으면 상세 응답 전에도 목록의 이미지·좋아요 값을 보여 준다(REQ-NAV-027). */
  openPostDetail(target: { postId: string; seed: PostSummary | null }): void;
  /** 알림함. */
  openNotifications(): void;
  /** 배너 웹뷰(IssueWeb). */
  openBanner(banner: { id: string; webViewUrl: string }): void;
  /** 전시 탭을 해당 날짜의 인기순으로 연다(REQ-HOME-031). */
  openDisplayPopular(date: KstDate): void;
  /** 기록 탭. selectedDate가 있으면 그 날짜의 달을 불러오고 그 날짜를 선택한다(REQ-HOME-023). */
  openRecord(selectedDate: KstDate | null): void;
}
