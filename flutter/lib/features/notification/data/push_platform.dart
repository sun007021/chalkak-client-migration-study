import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

import '../../../core/config/firebase_config.dart';
import '../../../core/push/notification_permission.dart';
import '../../../core/push/push_message_source.dart';
import '../../../core/push/push_token_provider.dart';
import '../domain/push_foreground_handler.dart';
import 'firebase_messaging_gateway.dart';
import 'firebase_push_adapters.dart';
import 'local_notifications_gateway.dart';

/// 푸시 SDK 쪽 구현 묶음. Firebase 설정이 없거나 초기화가 실패하면 아무것도 하지 않는 구현으로 채운
/// [PushPlatform.disabled]이고, 그때도 앱은 정상적으로 뜬다([isAvailable]이 false).
class PushPlatform {
  const PushPlatform({
    required this.isAvailable,
    required this.messages,
    required this.tokens,
    required this.permission,
    required this.presenter,
    required this.showsLocalNotification,
  });

  /// 푸시를 받을 수 없는 구성(설정 없음, 초기화 실패, 지원하지 않는 플랫폼).
  const PushPlatform.disabled()
    : isAvailable = false,
      messages = const _NoopPushMessageSource(),
      tokens = const _NoopPushTokenProvider(),
      permission = const _NoopNotificationPermission(),
      presenter = const _NoopLocalNotificationPresenter(),
      showsLocalNotification = false;

  /// 초기화가 끝나면 완료된다. 이미 정해진 구성은 바로 완료되고, [PushPlatform.deferred]는 초기화를 기다린다.
  Future<void> get ready => Future.value();

  /// false면 권한 요청·기기 등록·수신 연결을 하지 않는다.
  final bool isAvailable;
  final PushMessageSource messages;
  final PushTokenProvider tokens;
  final NotificationPermission permission;
  final LocalNotificationPresenter presenter;

  /// Android: 포그라운드 푸시를 앱이 직접 표시한다. iOS는 OS가 표시한다.
  final bool showsLocalNotification;

  /// `runApp`을 막지 않도록 초기화를 뒤로 미룬 구성. 초기화가 끝나기 전의 호출은 끝날 때까지 기다리고,
  /// 초기화가 실패하면 [PushPlatform.disabled]처럼 아무 일도 하지 않는다.
  factory PushPlatform.deferred(
    Future<PushPlatform> initialization, {
    TargetPlatform? platform,
  }) = _DeferredPushPlatform;

  /// Firebase를 초기화하고 실제 구현을 만든다. 실패하면 이유를 한 번만 로그에 남기고
  /// [PushPlatform.disabled]를 돌려준다(예외를 밖으로 내지 않는다).
  ///
  /// - [config]가 있으면 그 값으로 초기화한다(`--dart-define`).
  /// - 없으면 네이티브 설정 파일(iOS `GoogleService-Info.plist`)로 초기화를 시도한다. Android는 설정 파일을 읽는
  ///   Gradle 플러그인이 없어 보통 실패하고, 그러면 꺼진 채로 뜬다.
  static Future<PushPlatform> initialize({
    FirebaseConfig? config,
    TargetPlatform? platform,
    Future<void> Function(FirebaseConfig? config)? initializeFirebase,
    FirebaseMessagingGateway Function()? messagingGateway,
    LocalNotificationsGateway Function()? localGateway,
    void Function(String message)? log,
    Duration timeout = const Duration(seconds: 3),
  }) async {
    final write = log ?? debugPrint;
    final target = platform ?? defaultTargetPlatform;
    final isAndroid = target == TargetPlatform.android;
    if (!isAndroid && target != TargetPlatform.iOS) {
      write('푸시 꺼짐: 지원하지 않는 플랫폼($target)');
      return const PushPlatform.disabled();
    }
    try {
      await (initializeFirebase ?? _initializeFirebase)(config)
          .timeout(timeout);
      final gateway =
          (messagingGateway ?? PluginFirebaseMessagingGateway.new)();
      LocalNotificationsGateway? local;
      if (isAndroid) {
        local = (localGateway ?? PluginLocalNotificationsGateway.new)();
        await local.initialize();
      } else {
        await gateway.presentForegroundNotifications();
      }
      return PushPlatform(
        isAvailable: true,
        messages: FirebasePushMessageSource(gateway, local),
        tokens: FirebasePushTokenProvider(gateway),
        permission: FirebaseNotificationPermission(gateway),
        presenter: local == null
            ? const _NoopLocalNotificationPresenter()
            : LocalNotificationsPresenter(local),
        showsLocalNotification: isAndroid,
      );
    } on Object catch (error) {
      // 설정 파일·값이 없는 개발 빌드가 정상 경로다. 토큰이나 키가 아니라 오류 종류만 남긴다.
      write('푸시 꺼짐: Firebase를 초기화하지 못했다(${error.runtimeType})');
      return const PushPlatform.disabled();
    }
  }

  static Future<void> _initializeFirebase(FirebaseConfig? config) async {
    if (config == null) {
      await Firebase.initializeApp();
      return;
    }
    await Firebase.initializeApp(
      options: FirebaseOptions(
        apiKey: config.apiKey,
        appId: config.appId,
        messagingSenderId: config.messagingSenderId,
        projectId: config.projectId,
        iosBundleId: config.iosBundleId,
      ),
    );
  }
}

class _NoopPushMessageSource implements PushMessageSource {
  const _NoopPushMessageSource();

  @override
  Stream<PushMessage> get foreground => const Stream.empty();

  @override
  Stream<PushMessage> get opened => const Stream.empty();

  @override
  Future<PushMessage?> initialMessage() async => null;
}

class _NoopPushTokenProvider implements PushTokenProvider {
  const _NoopPushTokenProvider();

  @override
  Future<String?> currentToken() async => null;

  @override
  Stream<String> get tokenRefreshed => const Stream.empty();
}

class _NoopNotificationPermission implements NotificationPermission {
  const _NoopNotificationPermission();

  @override
  Future<OsPermissionStatus> status() async => OsPermissionStatus.denied;

  @override
  Future<OsPermissionStatus> request() async => OsPermissionStatus.denied;
}

class _NoopLocalNotificationPresenter implements LocalNotificationPresenter {
  const _NoopLocalNotificationPresenter();

  @override
  Future<void> show({
    required String channelId,
    required String title,
    required String body,
    String? payload,
  }) async {}
}

class _DeferredPushPlatform implements PushPlatform {
  _DeferredPushPlatform(
    Future<PushPlatform> initialization, {
    TargetPlatform? platform,
  }) : showsLocalNotification =
           (platform ?? defaultTargetPlatform) == TargetPlatform.android {
    _future = initialization.then<PushPlatform>(
      (resolved) => _resolved = resolved,
      onError: (Object _) => _resolved = const PushPlatform.disabled(),
    );
    messages = _DeferredMessages(_future);
    tokens = _DeferredTokens(_future);
    permission = _DeferredPermission(_future);
    presenter = _DeferredPresenter(_future);
  }

  late final Future<PushPlatform> _future;
  PushPlatform? _resolved;

  @override
  bool get isAvailable => _resolved?.isAvailable ?? false;

  /// 로컬 표시 여부는 플랫폼으로 정해진다. 꺼진 구성이면 권한이 denied라 핸들러가 표시하지 않는다.
  @override
  final bool showsLocalNotification;

  @override
  Future<void> get ready => _future.then((_) {});

  @override
  late final PushMessageSource messages;
  @override
  late final PushTokenProvider tokens;
  @override
  late final NotificationPermission permission;
  @override
  late final LocalNotificationPresenter presenter;
}

class _DeferredMessages implements PushMessageSource {
  _DeferredMessages(this._platform);
  final Future<PushPlatform> _platform;

  @override
  Stream<PushMessage> get foreground =>
      Stream.fromFuture(_platform).asyncExpand((p) => p.messages.foreground);

  @override
  Stream<PushMessage> get opened =>
      Stream.fromFuture(_platform).asyncExpand((p) => p.messages.opened);

  @override
  Future<PushMessage?> initialMessage() async =>
      (await _platform).messages.initialMessage();
}

class _DeferredTokens implements PushTokenProvider {
  _DeferredTokens(this._platform);
  final Future<PushPlatform> _platform;

  @override
  Future<String?> currentToken() async =>
      (await _platform).tokens.currentToken();

  @override
  Stream<String> get tokenRefreshed =>
      Stream.fromFuture(_platform).asyncExpand((p) => p.tokens.tokenRefreshed);
}

class _DeferredPermission implements NotificationPermission {
  _DeferredPermission(this._platform);
  final Future<PushPlatform> _platform;

  @override
  Future<OsPermissionStatus> status() async =>
      (await _platform).permission.status();

  @override
  Future<OsPermissionStatus> request() async =>
      (await _platform).permission.request();
}

class _DeferredPresenter implements LocalNotificationPresenter {
  _DeferredPresenter(this._platform);
  final Future<PushPlatform> _platform;

  @override
  Future<void> show({
    required String channelId,
    required String title,
    required String body,
    String? payload,
  }) async => (await _platform).presenter.show(
    channelId: channelId,
    title: title,
    body: body,
    payload: payload,
  );
}
