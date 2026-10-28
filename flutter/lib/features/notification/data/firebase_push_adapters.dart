import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';

import '../../../core/push/notification_permission.dart';
import '../../../core/push/push_message_source.dart';
import '../../../core/push/push_payload.dart';
import '../../../core/push/push_payload_codec.dart';
import '../../../core/push/push_token_provider.dart';
import 'firebase_messaging_gateway.dart';
import 'local_notifications_gateway.dart';

/// `RemoteMessage`를 [PushMessage]로 바꾼다. `data`가 평탄한 맵(Android extras, iOS userInfo의 커스텀 키)이다.
PushMessage pushMessageFromRemote(RemoteMessage message) {
  final notification = message.notification;
  return PushMessage(
    payload: PushPayloadAdapters.fromPluginData(message.data),
    title: notification?.title,
    body: notification?.body,
  );
}

/// FCM 토큰 공급자. 토큰 원문은 어디에도 출력하지 않는다(REQ-PUSH-018).
class FirebasePushTokenProvider implements PushTokenProvider {
  FirebasePushTokenProvider(this._gateway);

  final FirebaseMessagingGateway _gateway;

  /// iOS에서 APNs 토큰이 아직 없으면 플러그인이 던진다. 그때는 아직 없음(null)이고,
  /// 준비되면 [tokenRefreshed]로 온다.
  @override
  Future<String?> currentToken() async {
    try {
      return await _gateway.getToken();
    } on Object {
      return null;
    }
  }

  @override
  Stream<String> get tokenRefreshed => _gateway.onTokenRefresh;
}

/// OS 알림 권한. 이 앱은 Android 방식(OS 대화상자만)이다.
/// `firebase_messaging`이 Android 13+의 "아직 묻지 않음"과 "거부"를 구분해 준다.
/// Android 12 이하는 런타임 권한이 없어 알림이 켜져 있으면 허용으로 읽힌다.
class FirebaseNotificationPermission implements NotificationPermission {
  FirebaseNotificationPermission(this._gateway);

  final FirebaseMessagingGateway _gateway;

  @override
  Future<OsPermissionStatus> status() async =>
      mapAuthorization(await _gateway.authorizationStatus());

  @override
  Future<OsPermissionStatus> request() async =>
      mapAuthorization(await _gateway.requestPermission());

  static OsPermissionStatus mapAuthorization(AuthorizationStatus status) =>
      switch (status) {
        AuthorizationStatus.authorized ||
        AuthorizationStatus.provisional => OsPermissionStatus.granted,
        AuthorizationStatus.notDetermined => OsPermissionStatus.notDetermined,
        AuthorizationStatus.denied ||
        AuthorizationStatus.deniedPermanently => OsPermissionStatus.denied,
      };
}

/// FCM 수신 창구. 알림을 누른 이벤트는 FCM이 만든 시스템 알림과 앱이 직접 만든 로컬 알림(Android 포그라운드)
/// 두 곳에서 오므로 [opened]로 합친다.
class FirebasePushMessageSource implements PushMessageSource {
  FirebasePushMessageSource(this._gateway, [this._local]);

  final FirebaseMessagingGateway _gateway;
  final LocalNotificationsGateway? _local;

  StreamController<PushMessage>? _opened;
  StreamSubscription<RemoteMessage>? _openedFromFcm;
  StreamSubscription<String?>? _openedFromLocal;
  bool _initialConsumed = false;

  @override
  Stream<PushMessage> get foreground =>
      _gateway.onMessage.map(pushMessageFromRemote);

  @override
  Stream<PushMessage> get opened {
    return (_opened ??= StreamController<PushMessage>.broadcast(
      onListen: _attach,
      onCancel: _detach,
    )).stream;
  }

  void _attach() {
    final controller = _opened;
    if (controller == null) return;
    _openedFromFcm ??= _gateway.onMessageOpenedApp.listen(
      (m) => controller.add(pushMessageFromRemote(m)),
      onError: (Object _) {},
    );
    _openedFromLocal ??= _local?.taps.listen((payload) {
      final decoded = PushPayloadCodec.decode(payload);
      // 알 수 없는 payload여도 탭은 탭이다: type 없음 = 알림함 폴백(REQ-PUSH-026).
      controller.add(PushMessage(payload: decoded ?? const PushPayload()));
    }, onError: (Object _) {});
  }

  void _detach() {
    unawaited(_openedFromFcm?.cancel());
    unawaited(_openedFromLocal?.cancel());
    _openedFromFcm = null;
    _openedFromLocal = null;
  }

  @override
  Future<PushMessage?> initialMessage() async {
    if (_initialConsumed) return null;
    _initialConsumed = true;
    try {
      final fcm = await _gateway.getInitialMessage();
      if (fcm != null) return pushMessageFromRemote(fcm);
      final launched = await _local?.launchPayload();
      if (launched == null) return null;
      return PushMessage(
        payload: PushPayloadCodec.decode(launched) ?? const PushPayload(),
      );
    } on Object {
      return null;
    }
  }
}
