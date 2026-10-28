import 'dart:async';

import 'package:clock/clock.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../../../core/copy/ko.g.dart';
import '../domain/push_foreground_handler.dart';

/// `flutter_local_notifications` 플러그인을 감싼 창구(Android 포그라운드 표시용).
abstract interface class LocalNotificationsGateway {
  /// 플러그인을 초기화하고 알림 채널 [androidPushChannelId]를 만든다(TC-PUSH-072).
  Future<void> initialize();

  /// 앱이 직접 만든 알림을 눌렀을 때의 payload.
  Stream<String?> get taps;

  /// 이 알림을 눌러 앱이 시작됐다면 그 payload, 아니면 null.
  Future<String?> launchPayload();

  Future<void> show({
    required int id,
    required String channelId,
    required String title,
    required String body,
    String? payload,
  });
}

class PluginLocalNotificationsGateway implements LocalNotificationsGateway {
  PluginLocalNotificationsGateway([FlutterLocalNotificationsPlugin? plugin])
    : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final FlutterLocalNotificationsPlugin _plugin;
  final StreamController<String?> _taps = StreamController<String?>.broadcast();

  /// 알림 작은 아이콘. 전용 단색 아이콘이 생기면 바꾼다.
  static const String _icon = '@mipmap/ic_launcher';

  @override
  Stream<String?> get taps => _taps.stream;

  @override
  Future<void> initialize() async {
    await _plugin.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings(_icon),
      ),
      onDidReceiveNotificationResponse: (response) =>
          _taps.add(response.payload),
    );
    final android = _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    await android?.createNotificationChannel(
      const AndroidNotificationChannel(
        androidPushChannelId,
        Copy.pushChannelName,
        importance: Importance.high,
      ),
    );
  }

  @override
  Future<String?> launchPayload() async {
    final details = await _plugin.getNotificationAppLaunchDetails();
    if (details == null || !details.didNotificationLaunchApp) return null;
    return details.notificationResponse?.payload;
  }

  @override
  Future<void> show({
    required int id,
    required String channelId,
    required String title,
    required String body,
    String? payload,
  }) {
    return _plugin.show(
      id: id,
      title: title,
      body: body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          channelId,
          Copy.pushChannelName,
          importance: Importance.high,
          priority: Priority.high,
          icon: _icon,
        ),
      ),
      payload: payload,
    );
  }
}

/// [LocalNotificationPresenter]의 구현. 알림 id는 시각에서 만들어 이전 알림을 덮어쓰지 않게 한다.
class LocalNotificationsPresenter implements LocalNotificationPresenter {
  LocalNotificationsPresenter(this._gateway);

  final LocalNotificationsGateway _gateway;

  @override
  Future<void> show({
    required String channelId,
    required String title,
    required String body,
    String? payload,
  }) {
    return _gateway.show(
      id: clock.now().millisecondsSinceEpoch & 0x7fffffff,
      channelId: channelId,
      title: title,
      body: body,
      payload: payload,
    );
  }
}
