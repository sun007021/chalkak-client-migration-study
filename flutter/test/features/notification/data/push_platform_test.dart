import 'dart:async';

import 'package:chalkak/core/push/notification_permission.dart';
import 'package:chalkak/core/push/push_message_source.dart';
import 'package:chalkak/core/push/push_payload.dart';
import 'package:chalkak/features/notification/data/firebase_messaging_gateway.dart';
import 'package:chalkak/features/notification/data/firebase_push_adapters.dart';
import 'package:chalkak/features/notification/data/local_notifications_gateway.dart';
import 'package:chalkak/features/notification/data/push_platform.dart';
import 'package:chalkak/features/notification/data/shared_preferences_push_stores.dart';
import 'package:chalkak/features/notification/domain/pending_push_store.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Gateway implements FirebaseMessagingGateway {
  String? token = 'tok';
  Object? tokenError;
  AuthorizationStatus status = AuthorizationStatus.notDetermined;
  RemoteMessage? initial;
  int initialReads = 0;
  bool presented = false;
  final refresh = StreamController<String>.broadcast();
  final message = StreamController<RemoteMessage>.broadcast();
  final openedApp = StreamController<RemoteMessage>.broadcast();

  @override
  Future<String?> getToken() async {
    final e = tokenError;
    if (e != null) throw e;
    return token;
  }

  @override
  Stream<String> get onTokenRefresh => refresh.stream;
  @override
  Stream<RemoteMessage> get onMessage => message.stream;
  @override
  Stream<RemoteMessage> get onMessageOpenedApp => openedApp.stream;
  @override
  Future<RemoteMessage?> getInitialMessage() async {
    initialReads++;
    return initial;
  }

  @override
  Future<AuthorizationStatus> authorizationStatus() async => status;
  @override
  Future<AuthorizationStatus> requestPermission() async =>
      status = AuthorizationStatus.authorized;
  @override
  Future<void> presentForegroundNotifications() async => presented = true;
}

class _Local implements LocalNotificationsGateway {
  bool initialized = false;
  String? launch;
  final tapController = StreamController<String?>.broadcast();
  final shown = <({String channelId, String? payload})>[];

  @override
  Future<void> initialize() async => initialized = true;
  @override
  Stream<String?> get taps => tapController.stream;
  @override
  Future<String?> launchPayload() async => launch;
  @override
  Future<void> show({
    required int id,
    required String channelId,
    required String title,
    required String body,
    String? payload,
  }) async => shown.add((channelId: channelId, payload: payload));
}

RemoteMessage _remote(Map<String, dynamic> data) => RemoteMessage(
  data: data,
  notification: const RemoteNotification(title: '제목', body: '본문'),
);

void main() {
  group('권한 매핑', () {
    test('허용·임시 허용은 granted, 거부는 denied, 미결정은 notDetermined', () async {
      final g = _Gateway();
      final p = FirebaseNotificationPermission(g);
      expect(await p.status(), OsPermissionStatus.notDetermined);
      expect(await p.request(), OsPermissionStatus.granted);
      g.status = AuthorizationStatus.provisional;
      expect(await p.status(), OsPermissionStatus.granted);
      g.status = AuthorizationStatus.denied;
      expect(await p.status(), OsPermissionStatus.denied);
      g.status = AuthorizationStatus.deniedPermanently;
      expect(await p.status(), OsPermissionStatus.denied);
    });
  });

  group('토큰', () {
    test('TC-PUSH-018 토큰 조회가 던져도(APNs 미준비) null이다', () async {
      final g = _Gateway()..tokenError = StateError('apns');
      expect(await FirebasePushTokenProvider(g).currentToken(), isNull);
    });

    test('TC-PUSH-015 갱신 스트림을 그대로 낸다', () async {
      final g = _Gateway();
      final p = FirebasePushTokenProvider(g);
      final future = p.tokenRefreshed.first;
      g.refresh.add('new');
      expect(await future, 'new');
    });
  });

  group('수신 창구', () {
    test('foreground는 data와 notification을 PushMessage로 바꾼다', () async {
      final g = _Gateway();
      final source = FirebasePushMessageSource(g);
      final future = source.foreground.first;
      g.message.add(
        _remote({
          'type': 'TOPIC',
          'aps': {'a': 1},
        }),
      );
      final m = await future;
      expect(m.payload.type, 'TOPIC');
      expect(m.title, '제목');
      expect(m.body, '본문');
    });

    test('opened는 FCM 알림 탭과 로컬 알림 탭을 합친다', () async {
      final g = _Gateway();
      final l = _Local();
      final source = FirebasePushMessageSource(g, l);
      final got = <PushMessage>[];
      final sub = source.opened.listen(got.add);
      g.openedApp.add(_remote({'type': 'NOTICE'}));
      l.tapController.add('{"type":"TOPIC"}');
      l.tapController.add('not json');
      await Future<void>.delayed(Duration.zero);
      expect(got.map((m) => m.payload.type), ['NOTICE', 'TOPIC', null]);
      await sub.cancel();
    });

    test('initialMessage는 FCM 우선, 없으면 로컬 알림 시작 payload, 한 번만 읽힌다', () async {
      final g = _Gateway();
      final l = _Local()..launch = '{"type":"REMINDER"}';
      final source = FirebasePushMessageSource(g, l);
      final first = await source.initialMessage();
      expect(first!.payload.type, 'REMINDER');
      expect(await source.initialMessage(), isNull);
      expect(g.initialReads, 1);
    });
  });

  group('PushPlatform.initialize', () {
    test('TC-PUSH-072 Android는 채널을 만들고 로컬 표시를 쓴다', () async {
      final l = _Local();
      final platform = await PushPlatform.initialize(
        platform: TargetPlatform.android,
        initializeFirebase: (_) async {},
        messagingGateway: _Gateway.new,
        localGateway: () => l,
        log: (_) {},
      );
      expect(platform.isAvailable, isTrue);
      expect(platform.showsLocalNotification, isTrue);
      expect(l.initialized, isTrue);
      await platform.presenter.show(
        channelId: 'moderation_push',
        title: 't',
        body: 'b',
        payload: 'p',
      );
      expect(l.shown.single.channelId, 'moderation_push');
    });

    test('TC-PUSH-069 iOS는 포그라운드 표시 옵션을 켜고 로컬 표시는 쓰지 않는다', () async {
      final g = _Gateway();
      final platform = await PushPlatform.initialize(
        platform: TargetPlatform.iOS,
        initializeFirebase: (_) async {},
        messagingGateway: () => g,
        log: (_) {},
      );
      expect(g.presented, isTrue);
      expect(platform.showsLocalNotification, isFalse);
    });

    test('Firebase 초기화가 실패하면 꺼진 구현으로 돌아가고 로그는 한 번이다', () async {
      final logs = <String>[];
      final platform = await PushPlatform.initialize(
        platform: TargetPlatform.android,
        initializeFirebase: (_) async => throw StateError('no config'),
        log: logs.add,
      );
      expect(platform.isAvailable, isFalse);
      expect(logs, hasLength(1));
      expect(await platform.tokens.currentToken(), isNull);
      expect(await platform.messages.initialMessage(), isNull);
      expect(await platform.permission.request(), OsPermissionStatus.denied);
    });

    test('지원하지 않는 플랫폼은 꺼진다', () async {
      final platform = await PushPlatform.initialize(
        platform: TargetPlatform.linux,
        log: (_) {},
      );
      expect(platform.isAvailable, isFalse);
    });
  });

  group('SharedPreferences 저장소', () {
    setUp(() => SharedPreferences.setMockInitialValues({}));

    test('TC-PUSH-063 보류 탭을 저장·복원·삭제한다', () async {
      final store = SharedPreferencesPendingPushStore();
      expect(await store.read(), isNull);
      await store.write(
        const PendingPush(
          payload: PushPayload(type: 'TOPIC', sourceId: 'x'),
          userId: 'u1',
        ),
      );
      final back = await SharedPreferencesPendingPushStore().read();
      expect(back!.userId, 'u1');
      expect(back.payload.type, 'TOPIC');
      expect(back.payload.sourceId, 'x');
      await store.clear();
      expect(await store.read(), isNull);
    });

    test('깨진 보류 값은 없는 것으로 보고 지운다', () async {
      SharedPreferences.setMockInitialValues({
        SharedPreferencesPendingPushStore.key: '{broken',
      });
      final store = SharedPreferencesPendingPushStore();
      expect(await store.read(), isNull);
      expect(
        (await SharedPreferences.getInstance()).getString('push.pending'),
        isNull,
      );
    });

    test('TC-PUSH-003 권한 요청 표시는 기기 단위로 남는다', () async {
      final flag = SharedPreferencesPermissionPromptFlag();
      expect(await flag.isRequested(), isFalse);
      await flag.markRequested();
      expect(
        await SharedPreferencesPermissionPromptFlag().isRequested(),
        isTrue,
      );
    });
  });

  group('PushPlatform.deferred', () {
    test('초기화가 끝나기 전에는 꺼진 것으로 보이고 끝나면 실제 구성을 따른다', () async {
      final done = Completer<PushPlatform>();
      final p = PushPlatform.deferred(
        done.future,
        platform: TargetPlatform.iOS,
      );
      expect(p.isAvailable, isFalse);
      final token = p.tokens.currentToken();
      done.complete(const PushPlatform.disabled());
      await p.ready;
      expect(await token, isNull);
      expect(p.isAvailable, isFalse);
    });

    test('초기화 future가 실패해도 예외 없이 꺼진 구성으로 동작한다', () async {
      final p = PushPlatform.deferred(
        Future<PushPlatform>.error(StateError('x')),
        platform: TargetPlatform.android,
      );
      await p.ready;
      expect(p.isAvailable, isFalse);
      expect(await p.permission.status(), OsPermissionStatus.denied);
      expect(await p.messages.initialMessage(), isNull);
    });
  });
}
