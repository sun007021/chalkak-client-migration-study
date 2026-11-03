/**
 * 알림 화면이 다른 화면의 상태를 갱신하는 통로(컨테이너가 꽂는다).
 * - refreshUnread: 홈 알림 점을 다시 조회한다(홈 ViewModel.refreshUnread). 홈이 아직 만들어지지 않았거나 게스트면 아무 일도 없다. 실패해도 던지지 않는다.
 * - refreshInbox: 알림함 목록 첫 페이지를 조용히 다시 불러온다(inboxSession().viewModel.revalidate). 알림함 ViewModel이 아직 없으면 아무 일도 없다. 던지지 않는다.
 */
export interface NotificationSync {
  refreshUnread(): Promise<void>;
  refreshInbox(): Promise<void>;
}
