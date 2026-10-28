import 'package:firebase_messaging/firebase_messaging.dart';

/// `firebase_messaging` 플러그인을 얇게 감싼 창구. 어댑터 테스트는 이 인터페이스의 Fake를 쓴다.
abstract interface class FirebaseMessagingGateway {
  /// SDK가 지금 가진 FCM 토큰. iOS에서 APNs 토큰이 아직 없으면 플러그인이 던질 수 있다.
  Future<String?> getToken();

  Stream<String> get onTokenRefresh;

  /// 앱이 포그라운드일 때 도착한 푸시.
  Stream<RemoteMessage> get onMessage;

  /// 백그라운드에서 알림을 눌러 앱이 돌아온 경우.
  Stream<RemoteMessage> get onMessageOpenedApp;

  /// 종료 상태에서 알림을 눌러 시작된 경우.
  Future<RemoteMessage?> getInitialMessage();

  Future<AuthorizationStatus> authorizationStatus();

  /// OS 권한 대화상자(iOS, Android 13+ `POST_NOTIFICATIONS`)를 띄운다.
  Future<AuthorizationStatus> requestPermission();

  /// iOS 포그라운드에서도 배너·사운드를 표시하게 한다(`willPresent` 옵션, TC-PUSH-069).
  Future<void> presentForegroundNotifications();
}

class PluginFirebaseMessagingGateway implements FirebaseMessagingGateway {
  PluginFirebaseMessagingGateway([FirebaseMessaging? messaging])
    : _messaging = messaging ?? FirebaseMessaging.instance;

  final FirebaseMessaging _messaging;

  // 서버(`PUT /push-devices/current`)는 FCM 등록 토큰으로 발송한다. firebase_messaging 17이 권하는
  // `register()`/`onRegistered`는 Firebase Installation ID(직접 발송용 다른 식별자)를 주므로 쓰지 않는다.
  @override
  // ignore: deprecated_member_use
  Future<String?> getToken() => _messaging.getToken();

  @override
  // ignore: deprecated_member_use
  Stream<String> get onTokenRefresh => _messaging.onTokenRefresh;

  @override
  Stream<RemoteMessage> get onMessage => FirebaseMessaging.onMessage;

  @override
  Stream<RemoteMessage> get onMessageOpenedApp =>
      FirebaseMessaging.onMessageOpenedApp;

  @override
  Future<RemoteMessage?> getInitialMessage() => _messaging.getInitialMessage();

  @override
  Future<AuthorizationStatus> authorizationStatus() async =>
      (await _messaging.getNotificationSettings()).authorizationStatus;

  @override
  Future<AuthorizationStatus> requestPermission() async =>
      (await _messaging.requestPermission()).authorizationStatus;

  @override
  Future<void> presentForegroundNotifications() =>
      _messaging.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );
}
