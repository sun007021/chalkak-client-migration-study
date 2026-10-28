import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/core/push/notification_permission.dart';
import 'package:chalkak/features/notification/domain/push_bootstrap.dart';
import 'package:chalkak/features/notification/domain/push_device_registrar.dart';
import 'package:chalkak/features/notification/domain/push_foreground_handler.dart';
import 'package:chalkak/features/notification/domain/push_tap_coordinator.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_async_helpers.dart';
import '../../../support/fakes.dart';
import '../../../support/net_harness.dart' show settle;
import '../../../support/notification_fakes.dart';

class _Rig {
  _Rig() {
    final sessions = SessionManager(
      store: FakeTokenStore(sessionWithJwt(jwtFx('jwt__with-session-id'))),
    );
    registrar = PushDeviceRegistrar(
      tokens: tokens,
      devices: devices,
      sessions: sessions,
      refresher: FakeSessionRefresher(),
    );
    coordinator = PushTapCoordinator(
      sessions: sessions,
      store: FakePendingPushStore(),
      runner: tap.runner,
      navigator: tap.nav,
    );
    foreground = PushForegroundHandler(
      permission: FakeNotificationPermission(OsPermissionStatus.granted),
      presenter: presenter,
      unread: tap.unread,
      showsLocalNotification: true,
    );
    bootstrap = PushBootstrap(
      messages: source,
      tokens: tokens,
      registrar: registrar,
      coordinator: coordinator,
      foreground: foreground,
    );
  }

  final FakePushMessageSource source = FakePushMessageSource();
  final FakePushTokenProvider tokens = FakePushTokenProvider('tok-1');
  final FakePushDeviceRepository devices = FakePushDeviceRepository();
  final FakeLocalNotificationPresenter presenter =
      FakeLocalNotificationPresenter();
  final TapRig tap = TapRig();
  late final PushDeviceRegistrar registrar;
  late final PushTapCoordinator coordinator;
  late final PushForegroundHandler foreground;
  late final PushBootstrap bootstrap;
}

void main() {
  fakeTest('TC-PUSH-062 콜드 스타트 initialMessage는 메인이 준비된 뒤 정확히 1회 이동한다', (async) {
    final r = _Rig();
    r.source.initial = pushMessageFx('payload__topic');
    resolve(async, r.bootstrap.start());
    expect(r.tap.nav.calls, isEmpty, reason: '메인이 아직 준비되지 않았다');
    r.coordinator.setMainReady(true);
    settle(async);
    expect(r.tap.nav.calls, ['home:top']);
    resolve(async, r.bootstrap.start());
    expect(r.source.initialReads, 1, reason: '시작을 두 번 불러도 한 벌');
    expect(r.tap.nav.calls, ['home:top']);
  });

  fakeTest('REQ-PUSH-032 백그라운드에서 알림을 눌러 돌아온 opened 이벤트를 같은 라우팅에 넘긴다', (async) {
    final r = _Rig();
    r.coordinator.setMainReady(true);
    resolve(async, r.bootstrap.start());
    r.source.emitOpened(pushMessageFx('payload__post-approved'));
    settle(async);
    expect(r.tap.nav.calls, ['feed:$myPostId']);
  });

  fakeTest('TC-PUSH-071 포그라운드 메시지는 처리기로 가고 탭 이동은 일으키지 않는다', (async) {
    final r = _Rig();
    r.coordinator.setMainReady(true);
    resolve(async, r.bootstrap.start());
    r.source.emitForeground(pushMessageFx('payload__post-approved'));
    settle(async);
    expect(r.presenter.shown, hasLength(1));
    expect(r.tap.unread.calls, 1);
    expect(r.tap.nav.calls, isEmpty);
  });

  fakeTest('TC-PUSH-015 토큰 갱신 이벤트는 등록기로 가 새 토큰으로 등록한다', (async) {
    final r = _Rig();
    resolve(async, r.bootstrap.start());
    r.tokens.emitRefresh('tok-2');
    settle(async);
    expect(r.devices.tokens, ['tok-2']);
  });

  fakeTest('dispose 뒤에는 어떤 이벤트도 처리하지 않는다', (async) {
    final r = _Rig();
    r.coordinator.setMainReady(true);
    resolve(async, r.bootstrap.start());
    resolve(async, r.bootstrap.dispose());
    r.source.emitOpened(pushMessageFx('payload__topic'));
    r.source.emitForeground(pushMessageFx('payload__topic'));
    r.tokens.emitRefresh('tok-3');
    settle(async);
    expect(r.tap.nav.calls, isEmpty);
    expect(r.presenter.shown, isEmpty);
    expect(r.devices.calls, 0);
  });
}
