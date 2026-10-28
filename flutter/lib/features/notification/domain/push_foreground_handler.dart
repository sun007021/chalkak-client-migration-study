import '../../../core/copy/ko.g.dart';
import '../../../core/push/notification_permission.dart';
import '../../../core/push/push_message_source.dart';
import 'unread_refresher.dart';

/// Android 알림 채널 id(`push.channel.name`은 "게시물 검수 알림", 임시 유지: 확인 필요 6).
const String androidPushChannelId = 'moderation_push';

/// 앱이 직접 알림을 만드는 플랫폼(Android)의 표시 창구.
abstract interface class LocalNotificationPresenter {
  Future<void> show({
    required String channelId,
    required String title,
    required String body,
  });
}

sealed class ForegroundDecision {
  const ForegroundDecision();
}

/// 서버가 준 제목·본문으로 표시한다. 본문이 비어 있으면 `Copy.pushDefaultBody`.
final class ShowForeground extends ForegroundDecision {
  const ShowForeground({required this.title, required this.body});
  final String title;
  final String body;
}

final class SuppressForeground extends ForegroundDecision {
  const SuppressForeground();
}

/// 포그라운드 푸시 수신(REQ-PUSH-019~020, TC-PUSH-068~071, 073).
/// - 수신하면 미읽음을 다시 조회한다(권한 유무와 관계없이).
/// - OS 권한이 허용([OsPermissionStatus.granted])이거나 런타임 권한이 없는 환경([OsPermissionStatus.notRequired])일 때만
///   [ShowForeground], 아니면 [SuppressForeground]. type과 알림 설정으로 거르지 않는다(수신 제어는 서버 책임).
///   AI 피드백 화면을 보는 중에도 생략하지 않는다(임시 규칙, 확인 필요 2: 카탈로그 TC-PUSH-070의 생략 규칙은 채택하지 않음).
/// - [showsLocalNotification](Android)이면 [LocalNotificationPresenter]로 채널 [androidPushChannelId]에 직접 표시한다.
///   iOS는 false이고 결정 값을 `willPresent` 옵션(배너·사운드)으로 바꿔 돌려준다.
class PushForegroundHandler {
  PushForegroundHandler({
    required this._permission,
    required this._presenter,
    required this._unread,
    required this.showsLocalNotification,
  });

  final NotificationPermission _permission;
  final LocalNotificationPresenter _presenter;
  final UnreadRefresher _unread;
  final bool showsLocalNotification;

  Future<ForegroundDecision> handle(PushMessage message) async {
    // 표시 여부와 무관하게 미읽음 점을 갱신한다. 실패는 이전 표시를 유지한다.
    try {
      await _unread.refreshUnread();
    } on Object {
      // 삼킨다.
    }

    final OsPermissionStatus status;
    try {
      status = await _permission.status();
    } on Object {
      return const SuppressForeground();
    }
    if (status != OsPermissionStatus.granted &&
        status != OsPermissionStatus.notRequired) {
      return const SuppressForeground();
    }

    final body = message.body;
    final decision = ShowForeground(
      title: message.title ?? '',
      body: (body == null || body.isEmpty) ? Copy.pushDefaultBody : body,
    );
    if (showsLocalNotification) {
      try {
        await _presenter.show(
          channelId: androidPushChannelId,
          title: decision.title,
          body: decision.body,
        );
      } on Object {
        // 표시 실패가 수신 처리를 막지 않는다.
      }
    }
    return decision;
  }
}
