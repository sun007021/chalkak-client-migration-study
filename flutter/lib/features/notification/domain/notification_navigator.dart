import '../../feed/domain/feed_target.dart';

/// 알림·푸시 처리가 화면을 옮길 때 쓰는 창구. 구현은 `lib/app`의 라우터 어댑터가 맡고
/// (`MainShellNavigator`와 같은 클래스가 겸할 수 있다), 테스트는 호출을 기록하는 Fake를 쓴다.
abstract interface class NotificationNavigator {
  /// 홈 탭. [scrollToTopAndRefresh]면 맨 위로 스크롤하고 새로고침한다(TOPIC).
  /// 이미 홈이면 화면을 더 쌓지 않는다(TC-PUSH-065).
  Future<void> openHome({required bool scrollToTopAndRefresh});

  /// 알림함 목록. 이미 열려 있으면 쌓지 않는다.
  Future<void> openInbox();

  /// 게시물 상세. [target]은 `FeedOrigin.push`, 내 게시물이다.
  /// [openAiFeedback]이 true면 상세가 AI 피드백 시트를 최신 GET 기준으로 한 번 자동으로 연다.
  /// 같은 게시물 상세가 이미 열려 있으면 새로 쌓지 않고 교체한다(TC-PUSH-064).
  Future<void> openFeed(FeedTarget target, {required bool openAiFeedback});

  /// 알림 상세(`POST_REJECTED`, `NOTICE`). [notificationId]는 소문자 UUID.
  Future<void> openNotificationDetail(String notificationId);

  /// 알림 상세에서 "알림함으로". 알림함이 아래에 있으면 상세만 닫고 없으면 알림함으로 간다(REQ-NOTI-026).
  Future<void> backToInbox();

  /// 로그인 화면으로(스택 교체).
  void goToLogin();
}
