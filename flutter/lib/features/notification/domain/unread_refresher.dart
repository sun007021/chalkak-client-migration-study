/// 홈 알림 벨의 미읽음 점을 다시 조회하는 창구(D-10, REQ-NOTI-029).
/// 홈 ViewModel의 `refreshUnread`가 구현 쪽 어댑터가 된다. 게스트면 아무것도 하지 않고
/// 실패는 삼킨다(이전 표시 유지). 이 인터페이스는 조회 트리거만 안다.
abstract interface class UnreadRefresher {
  Future<void> refreshUnread();
}
