import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/features/notification/data/api_push_device_repository.dart';
import 'package:chalkak/features/notification/data/api_session_refresher.dart';
import 'package:chalkak/features/notification/domain/push_device_registrar.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/net_harness.dart';
import '../../../support/notification_fakes.dart';

PushDeviceRegistrar _registrar(NetHarness h) => PushDeviceRegistrar(
  tokens: FakePushTokenProvider('tok'),
  devices: ApiPushDeviceRepository(client: h.client),
  sessions: h.sessions,
  refresher: ApiSessionRefresher(client: h.client),
);

void main() {
  netTest(
    'TC-PUSH-028 실제 연결: 등록이 REAUTH면 ApiClient가 세션을 지우고 등록기는 갱신·재등록 없이 멈춘다',
    (h, a) {
      h.adapter.on('PUT', '$v1/push-devices/current', [
        FakeResponse.fixture(
          'push/push-devices-current__reauthentication-required.json',
        ),
      ]);
      final r = Probe(_registrar(h).registerCurrentDevice());
      settle(a);
      expect(r.succeeded, isTrue, reason: '예외를 밖으로 내지 않는다');
      expect(h.clearedEvents, [SessionClearReason.reauthenticationRequired]);
      expect(h.adapter.count('PUT', '$v1/push-devices/current'), 1);
      expect(h.refreshCalls, 0, reason: '세션이 지워졌으니 갱신하지 않는다');
    },
    session: sessionWithJwt(jwtFx('jwt__with-session-id'), userId: 'user-1'),
  );

  netTest(
    'TC-PUSH-023 실제 연결: session_id 없는 토큰이면 ApiClient 갱신(single-flight)을 거쳐 새 토큰으로 등록한다',
    (h, a) {
      h.adapter.on('POST', '$v1/auth/refresh', [
        FakeResponse.json(
          200,
          refreshBody(jwtFx('jwt__with-session-id'), 'rt2'),
        ),
      ]);
      h.adapter.on('PUT', '$v1/push-devices/current', [
        FakeResponse.fixture('push/push-devices-current__no-content.json'),
      ]);
      Probe(_registrar(h).registerCurrentDevice());
      settle(a);
      expect(h.refreshCalls, 1);
      expect(h.adapter.count('PUT', '$v1/push-devices/current'), 1);
    },
    session: sessionWithJwt(jwtFx('jwt__without-session-id'), userId: 'user-1'),
  );
}
