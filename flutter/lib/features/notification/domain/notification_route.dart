import '../../../core/push/push_payload.dart';
import '../../feed/domain/feed_target.dart';
import 'notification_models.dart';

/// 알림·푸시 탭이 닿는 곳(D-11 목적지 표).
sealed class NotificationDestination {
  const NotificationDestination();
}

/// 홈. TOPIC만 [scrollToTopAndRefresh]가 true다.
final class HomeDestination extends NotificationDestination {
  const HomeDestination({required this.scrollToTopAndRefresh});
  final bool scrollToTopAndRefresh;
}

/// 알림함 목록.
final class InboxDestination extends NotificationDestination {
  const InboxDestination();
}

/// 게시물 상세. [postId]는 소문자 UUID이고 내 게시물이다.
final class FeedDestination extends NotificationDestination {
  const FeedDestination({required this.postId, required this.openAiFeedback});

  final String postId;

  /// AI 피드백 시트 자동 열기(최신 GET 기준 1회).
  final bool openAiFeedback;

  /// `FeedOrigin.push`, `isMine: true`, 시드 없음.
  FeedTarget get target => throw UnimplementedError();
}

/// 알림 상세. [notificationId]는 소문자 UUID(공지의 `sourceId`가 아니다).
final class NotificationDetailDestination extends NotificationDestination {
  const NotificationDetailDestination(this.notificationId);
  final String notificationId;
}

/// 탭 한 번의 계획: 어디로 가고, 먼저 읽음 처리할 알림이 있는지.
class NavigatePlan {
  const NavigatePlan(this.destination, {this.readNotificationId});

  final NotificationDestination destination;

  /// null이면 읽음 요청을 보내지 않는다(TOPIC, REMINDER, 알림함 폴백).
  final String? readNotificationId;
}

/// 푸시·알림함 행의 목적지 결정. 순수 함수이며 알림 제목·본문·`eventId`는 보지 않는다(REQ-PUSH-021).
///
/// 목적지 표(D-11):
/// - TOPIC -> 홈(맨 위 + 새로고침), REMINDER -> 홈. 읽음 없음.
/// - POST_APPROVED -> 게시물 상세(sourceId). 읽음 후 이동.
/// - AI_REVIEW_COMPLETED/FAILED -> 게시물 상세 + AI 시트. sourceType이 `POST`이고 sourceId가 UUID여야 한다.
/// - POST_REJECTED/NOTICE -> 알림 상세(notificationId). 읽음 후 이동. 쓰지 않는 필드(sourceId)는 검증하지 않는다.
/// UUID는 대소문자 무관하게 유효로 보고 결과에는 소문자 정규형을 담는다(TC-PUSH-048).
abstract final class NotificationRouter {
  /// 푸시 탭. 알 수 없는 type, type 누락, 필요한 필드 누락·UUID 아님, AI인데 sourceType이 POST가 아님은
  /// 읽음 없이 알림함([InboxDestination])으로 간다(REQ-PUSH-026).
  static NavigatePlan fromPush(PushPayload payload) =>
      throw UnimplementedError();

  /// 알림함 행 탭. 같은 목적지 표를 쓰지만 이동할 수 없는 행(알 수 없는 type, 필요한 필드 누락,
  /// AI인데 sourceType이 POST가 아님)은 null이다: 이동도 읽음 요청도 없고 오류도 아니다(REQ-NOTI-021).
  /// TOPIC/REMINDER 행은 읽음 요청 없이 홈이다(REQ-NOTI-022, 임시: 확인 필요 4).
  static NavigatePlan? fromInboxItem(NotificationItem item) =>
      throw UnimplementedError();

  /// 8-4-4-4-12 hex(대소문자 무관)면 소문자 정규형, 아니면 null.
  static String? normalizeUuid(String? raw) => throw UnimplementedError();
}
