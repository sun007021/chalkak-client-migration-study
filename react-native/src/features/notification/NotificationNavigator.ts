/** 알림·푸시 탭이 화면을 바꾸는 유일한 통로. 구현은 내비게이션이 맡고 테스트는 Fake를 쓴다. */
export interface NotificationNavigator {
  /** 홈 탭 루트로 간다(이미 홈이면 쌓지 않는다). */
  openHome(): void;
  /** 내 게시물 상세. 같은 게시물 상세가 이미 열려 있으면 교체한다. openAiSheet면 AI 피드백 시트를 자동으로 연다. */
  openPostDetail(target: { postId: string; openAiSheet: boolean }): void;
  openNotificationDetail(notificationId: string): void;
  /** 알림함 목록(푸시 폴백, 상세의 "알림함으로"). */
  openInbox(): void;
}
