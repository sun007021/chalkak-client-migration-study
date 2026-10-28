import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/features/notification/data/api_push_device_repository.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_adapter.dart';
import '../../../support/net_harness.dart';

const _path = '$v1/push-devices/current';

ApiPushDeviceRepository _repo(NetHarness h) =>
    ApiPushDeviceRepository(client: h.client);

ApiError _err(Probe<Object?> p) => p.error! as ApiError;

void main() {
  netTest(
    'TC-PUSH-012 PUT /push-devices/current 바디는 {fcmToken}뿐이고 204를 성공으로 읽는다',
    (h, a) {
      h.adapter.on('PUT', _path, [
        FakeResponse.fixture('push/push-devices-current__no-content.json'),
      ]);
      final r = Probe(_repo(h).register('tok-abc'));
      settle(a);
      expect(r.succeeded, isTrue);
      final req = h.adapter.requests.single;
      expect(req.method, 'PUT');
      expect(req.path, _path);
      expect(req.jsonBody, {'fcmToken': 'tok-abc'});
      expect(req.hasAuthorization, isTrue);
    },
    session: sessionAt(),
  );

  netTest('TC-PUSH-033 정지 회원도 204로 성공한다(클라이언트가 회원 상태로 막지 않는다)', (h, a) {
    h.adapter.on('PUT', _path, [
      FakeResponse.fixture('push/push-devices-current__no-content.json'),
    ]);
    final r = Probe(_repo(h).register('tok-abc'));
    settle(a);
    expect(r.succeeded, isTrue);
  }, session: sessionAt());

  netTest('TC-PUSH-031 빈 토큰은 요청 없이 ArgumentError(서버 400 방지)', (h, a) {
    final r = Probe(_repo(h).register(''));
    settle(a);
    expect(r.error, isA<ArgumentError>());
    expect(h.adapter.requests, isEmpty);
  }, session: sessionAt());

  netTest(
    'TC-PUSH-031 서버가 400 BUSINESS_ERROR로 답하면 server 오류(status 400)로 던진다',
    (h, a) {
      h.adapter.on('PUT', _path, [
        FakeResponse.fixture(
          'push/push-devices-current__bad-request-empty-token.json',
        ),
      ]);
      final r = Probe(_repo(h).register('x'));
      settle(a);
      expect(_err(r).status, 400);
      expect(h.adapter.count('PUT', _path), 1, reason: '400은 재시도하지 않는다');
    },
    session: sessionAt(),
  );

  netTest('TC-PUSH-027 만료 토큰 401 UNAUTHORIZED면 refresh 후 1회 재등록한다', (h, a) {
    h.adapter.on('PUT', _path, [
      FakeResponse.fixture('push/push-devices-current__unauthorized.json'),
      FakeResponse.fixture('push/push-devices-current__no-content.json'),
    ]);
    h.adapter.on('POST', '$v1/auth/refresh', [
      FakeResponse.fixture('auth/refresh__success.json'),
    ]);
    final r = Probe(_repo(h).register('tok-abc'));
    settle(a);
    expect(r.succeeded, isTrue);
    expect(h.refreshCalls, 1);
    expect(h.adapter.count('PUT', _path), 2);
  }, session: sessionAt());

  netTest('TC-PUSH-028 등록이 401 REAUTHENTICATION_REQUIRED면 reauth 오류로 던진다', (
    h,
    a,
  ) {
    h.adapter.on('PUT', _path, [
      FakeResponse.fixture(
        'push/push-devices-current__reauthentication-required.json',
      ),
    ]);
    final r = Probe(_repo(h).register('tok-abc'));
    settle(a);
    expect(_err(r).isReauthenticationRequired, isTrue);
    expect(h.adapter.count('PUT', _path), 1);
  }, session: sessionAt());

  netTest('TC-PUSH-034 탈퇴 회원 토큰의 401이 갱신에서도 REAUTH면 세션을 지운다(로그인 화면)', (h, a) {
    h.adapter.on('PUT', _path, [
      FakeResponse.fixture('push/push-devices-current__unauthorized.json'),
    ]);
    h.adapter.on('POST', '$v1/auth/refresh', [
      FakeResponse.fixture('auth/refresh__reauthentication-required.json'),
    ]);
    final r = Probe(_repo(h).register('tok-abc'));
    settle(a);
    expect(r.error, isNotNull);
    expect(h.clearedEvents, [SessionClearReason.reauthenticationRequired]);
  }, session: sessionAt());

  netTest('TC-PUSH-030 500이면 PUT은 멱등이라 0.5초, 1초 백오프로 최대 2회 재시도한다', (h, a) {
    h.adapter.on('PUT', _path, [
      FakeResponse.fixture('push/push-devices-current__internal-error.json'),
    ]);
    final r = Probe(_repo(h).register('tok-abc'));
    settle(a);
    expect(h.adapter.count('PUT', _path), 1);
    advance(a, const Duration(milliseconds: 500));
    expect(h.adapter.count('PUT', _path), 2);
    advance(a, const Duration(seconds: 1));
    expect(h.adapter.count('PUT', _path), 3);
    advance(a, const Duration(seconds: 5));
    expect(h.adapter.count('PUT', _path), 3, reason: '최대 2회 재시도');
    expect(_err(r).status, 500);
    expect(h.clearedEvents, isEmpty, reason: '로그인 유지');
  }, session: sessionAt());

  netTest('TC-PUSH-030 연결 실패도 재시도 뒤 network 오류이고 로그인은 유지된다', (h, a) {
    h.adapter.on('PUT', _path, [
      const FakeResponse.fault(FakeFault.disconnect),
    ]);
    final r = Probe(_repo(h).register('tok-abc'));
    advance(a, const Duration(seconds: 5));
    expect(_err(r).isNetwork, isTrue);
    expect(h.adapter.count('PUT', _path), 3);
    expect(h.clearedEvents, isEmpty);
  }, session: sessionAt());

  netTest('REQ-PUSH-018 토큰 원문은 네트워크 로그에 남지 않는다', (h, a) {
    h.adapter.on('PUT', _path, [
      FakeResponse.fixture('push/push-devices-current__no-content.json'),
    ]);
    Probe(_repo(h).register('SECRET-FCM-TOKEN-123'));
    settle(a);
    expect(h.logs.all, isNot(contains('SECRET-FCM-TOKEN-123')));
  }, session: sessionAt());
}
