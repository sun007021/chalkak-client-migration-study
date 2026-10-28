import 'dart:async';

import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/features/notification/domain/push_device_registrar.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_async_helpers.dart';
import '../../../support/fakes.dart';
import '../../../support/net_harness.dart' show settle;
import '../../../support/notification_fakes.dart';

const _otherUserId = otherUserId;

class _Rig {
  _Rig({Session? session, String? sdkToken}) {
    store = FakeTokenStore(
      session ?? sessionWithJwt(jwtFx('jwt__with-session-id')),
    );
    sessions = SessionManager(store: store);
    sessions.cleared.listen(cleared.add);
    tokens = FakePushTokenProvider(sdkToken);
    registrar = PushDeviceRegistrar(
      tokens: tokens,
      devices: devices,
      sessions: sessions,
      refresher: refresher,
    );
  }

  late final FakeTokenStore store;
  late final SessionManager sessions;
  late final FakePushTokenProvider tokens;
  final FakePushDeviceRepository devices = FakePushDeviceRepository();
  final FakeSessionRefresher refresher = FakeSessionRefresher();
  final List<SessionClearReason> cleared = [];
  late final PushDeviceRegistrar registrar;
}

void _register(FakeAsync async, _Rig r) =>
    resolve(async, r.registrar.registerCurrentDevice());

void main() {
  group('등록 트리거', () {
    fakeTest('TC-PUSH-012 로그인 성공 + FCM 토큰 준비면 그 토큰으로 1회 등록한다', (async) {
      final r = _Rig(sdkToken: 'tok-1');
      _register(async, r);
      expect(r.devices.tokens, ['tok-1']);
    });

    fakeTest('TC-PUSH-013 가입 직후(세션 저장 뒤)도 로그인과 같은 경로로 1회 시도한다', (async) {
      final r = _Rig(sdkToken: 'tok-1');
      _register(async, r);
      expect(r.devices.calls, 1);
    });

    fakeTest('TC-PUSH-014 인증된 상태로 앱을 다시 시작하면 1회 시도한다(session_id가 있으면 갱신 없이)', (
      async,
    ) {
      final r = _Rig(sdkToken: 'tok-1');
      _register(async, r);
      expect(r.devices.calls, 1);
      expect(r.refresher.calls, 0);
    });

    fakeTest('TC-PUSH-015 토큰이 갱신되면 새 토큰으로 마지막 값 기준 1회 등록한다', (async) {
      final r = _Rig(sdkToken: 'tok-1');
      _register(async, r);
      resolve(async, r.registrar.onTokenRefreshed('tok-2'));
      expect(r.devices.tokens, ['tok-1', 'tok-2']);
    });

    fakeTest('TC-PUSH-016 로그인 전에 토큰이 먼저 오면 등록하지 않고 로그인 성공 뒤 등록한다', (async) {
      final r = _Rig();
      resolve(async, r.store.clear());
      resolve(async, r.registrar.onTokenRefreshed('early'));
      expect(r.devices.calls, 0);
      r.store.current = sessionWithJwt(jwtFx('jwt__with-session-id'));
      _register(async, r);
      expect(r.devices.tokens, ['early']);
    });

    fakeTest('TC-PUSH-017 게스트면 토큰이 와도 등록 0건이다', (async) {
      final r = _Rig(session: Session.guest(), sdkToken: 'tok');
      resolve(async, r.registrar.onTokenRefreshed('tok'));
      _register(async, r);
      expect(r.devices.calls, 0);
      expect(r.refresher.calls, 0);
    });

    fakeTest('TC-PUSH-018 FCM 토큰이 아직 없으면 요청 0건이고 토큰이 준비되면 등록한다', (async) {
      final r = _Rig();
      _register(async, r);
      expect(r.devices.calls, 0);
      resolve(async, r.registrar.onTokenRefreshed('ready'));
      expect(r.devices.tokens, ['ready']);
    });

    fakeTest('TC-PUSH-019 전달받은 토큰이 없어도 SDK의 현재 토큰을 조회해 등록한다', (async) {
      final r = _Rig(sdkToken: 'sdk-now');
      _register(async, r);
      expect(r.tokens.currentCalls, 1);
      expect(r.devices.tokens, ['sdk-now']);
    });

    fakeTest('TC-PUSH-031 빈 FCM 토큰은 요청을 보내지 않는다', (async) {
      final r = _Rig(sdkToken: '');
      _register(async, r);
      resolve(async, r.registrar.onTokenRefreshed(''));
      expect(r.devices.calls, 0);
    });
  });

  group('중복 제거와 직렬화', () {
    fakeTest('TC-PUSH-020 같은 (userId, token)으로 트리거가 연달아 와도 요청은 1회다', (async) {
      final r = _Rig(sdkToken: 'tok');
      _register(async, r);
      _register(async, r);
      resolve(async, r.registrar.onTokenRefreshed('tok'));
      expect(r.devices.calls, 1);
    });

    fakeTest('TC-PUSH-021 세션 변경·포그라운드·토큰 갱신이 동시에 와도 요청은 직렬화되어 1회다', (async) {
      final r = _Rig(sdkToken: 'tok');
      r.devices.gate = Completer<void>();
      final a = start(async, r.registrar.registerCurrentDevice());
      final b = start(async, r.registrar.registerCurrentDevice());
      final c = start(async, r.registrar.onTokenRefreshed('tok'));
      expect(r.devices.maxInFlight, 1);
      r.devices.gate!.complete();
      settle(async);
      expect([a.done, b.done, c.done], everyElement(isTrue));
      expect(r.devices.calls, 1);
      expect(r.devices.maxInFlight, 1);
    });

    fakeTest('TC-PUSH-032 로그아웃 후 다른 계정으로 로그인하면 같은 토큰도 다시 등록한다', (async) {
      final r = _Rig(sdkToken: 'tok');
      _register(async, r);
      resolve(async, r.registrar.clearAll());
      r.store.current = sessionWithJwt(
        jwtFx('jwt__with-session-id'),
        userId: _otherUserId,
      );
      _register(async, r);
      expect(r.devices.tokens, ['tok', 'tok']);
    });

    fakeTest('TC-PUSH-032 clearAll 없이 계정만 바뀌어도 (userId, token) 쌍이 달라 다시 등록한다', (
      async,
    ) {
      final r = _Rig(sdkToken: 'tok');
      _register(async, r);
      r.store.current = sessionWithJwt(
        jwtFx('jwt__with-session-id'),
        userId: _otherUserId,
      );
      _register(async, r);
      expect(r.devices.calls, 2);
    });

    fakeTest('TC-PUSH-035 로그아웃(clearAll)은 기기 해제 호출을 하지 않는다', (async) {
      final r = _Rig(sdkToken: 'tok');
      _register(async, r);
      final before = r.devices.calls;
      resolve(async, r.registrar.clearAll());
      expect(r.devices.calls, before, reason: '해제 API가 없다. 서버가 세션과 함께 지운다');
    });
  });

  group('session_id와 갱신', () {
    fakeTest('TC-PUSH-022 session_id가 있으면 refresh 없이 바로 등록한다', (async) {
      final r = _Rig(sdkToken: 'tok');
      _register(async, r);
      expect(r.refresher.calls, 0);
      expect(r.devices.calls, 1);
    });

    fakeTest('TC-PUSH-023 session_id가 없으면 먼저 갱신하고 새 토큰으로 등록한다', (async) {
      final r = _Rig(
        session: sessionWithJwt(jwtFx('jwt__without-session-id')),
        sdkToken: 'tok',
      );
      r.refresher.results.add(sessionWithJwt(jwtFx('jwt__with-session-id')));
      _register(async, r);
      expect(r.refresher.calls, 1);
      expect(r.devices.calls, 1, reason: '갱신 뒤 1회 등록');
    });

    fakeTest('TC-PUSH-024 갱신한 토큰에도 session_id가 없으면 등록 요청 0건이고 로그인은 유지된다', (
      async,
    ) {
      final r = _Rig(
        session: sessionWithJwt(jwtFx('jwt__without-session-id')),
        sdkToken: 'tok',
      );
      r.refresher.results.add(sessionWithJwt(jwtFx('jwt__without-session-id')));
      _register(async, r);
      expect(r.refresher.calls, 1);
      expect(r.devices.calls, 0);
      expect(r.cleared, isEmpty);
      expect(resolve(async, r.sessions.read()), isNotNull);
    });

    fakeTest(
      'TC-PUSH-025 session_id 확인용 갱신이 REAUTHENTICATION_REQUIRED면 등록하지 않고 예외도 밖으로 내지 않는다',
      (async) {
        final r = _Rig(
          session: sessionWithJwt(jwtFx('jwt__without-session-id')),
          sdkToken: 'tok',
        );
        r.refresher.results.add(
          errorFx('auth/refresh__reauthentication-required.json'),
        );
        _register(async, r);
        expect(r.devices.calls, 0);
      },
    );

    fakeTest('TC-PUSH-023 갱신 도중 세션이 사라졌으면(null) 등록하지 않는다', (async) {
      final r = _Rig(
        session: sessionWithJwt(jwtFx('jwt__without-session-id')),
        sdkToken: 'tok',
      );
      r.refresher.results.add(null);
      _register(async, r);
      expect(r.devices.calls, 0);
    });
  });

  group('등록 실패', () {
    fakeTest(
      'TC-PUSH-028 등록이 REAUTHENTICATION_REQUIRED면 갱신을 한 번 하고 성공하면 한 번만 다시 등록한다',
      (async) {
        final r = _Rig(sdkToken: 'tok');
        r.devices.replies.add(
          errorFx('push/push-devices-current__reauthentication-required.json'),
        );
        r.refresher.results.add(sessionWithJwt(jwtFx('jwt__with-session-id')));
        _register(async, r);
        expect(r.refresher.calls, 1);
        expect(r.devices.calls, 2);
      },
    );

    fakeTest('TC-PUSH-028 재등록도 REAUTH이면 더 반복하지 않는다(무한 루프 없음)', (async) {
      final r = _Rig(sdkToken: 'tok');
      final reauth = errorFx(
        'push/push-devices-current__reauthentication-required.json',
      );
      r.devices.replies.addAll([reauth, reauth, reauth]);
      r.refresher.results.addAll([
        sessionWithJwt(jwtFx('jwt__with-session-id')),
        sessionWithJwt(jwtFx('jwt__with-session-id')),
      ]);
      _register(async, r);
      expect(r.refresher.calls, 1);
      expect(r.devices.calls, 2);
    });

    fakeTest('TC-PUSH-028 갱신도 REAUTH이면 재등록하지 않는다(로그인 화면 이동은 세션 정리 이벤트가 한다)', (
      async,
    ) {
      final r = _Rig(sdkToken: 'tok');
      r.devices.replies.add(
        errorFx('push/push-devices-current__reauthentication-required.json'),
      );
      r.refresher.results.add(
        errorFx('auth/refresh__reauthentication-required.json'),
      );
      _register(async, r);
      expect(r.devices.calls, 1);
    });

    fakeTest('TC-PUSH-029 등록이 계속 거절돼도(400, 401) 로그인을 해제하지 않고 예외를 내지 않는다', (
      async,
    ) {
      final r = _Rig(sdkToken: 'tok');
      r.devices.replies.addAll([
        errorFx('push/push-devices-current__bad-request-empty-token.json'),
        errorFx('push/push-devices-current__unauthorized.json'),
      ]);
      _register(async, r);
      _register(async, r);
      expect(r.cleared, isEmpty);
      expect(resolve(async, r.sessions.read()), isNotNull);
    });

    fakeTest(
      'TC-PUSH-030 TC-PUSH-012 네트워크 오류·500이어도 로그인을 유지하고 성공 기록이 없어 다음 트리거에 다시 시도한다',
      (async) {
        final r = _Rig(sdkToken: 'tok');
        r.devices.replies.addAll([
          networkError(),
          errorFx('push/push-devices-current__internal-error.json'),
        ]);
        _register(async, r);
        expect(r.devices.calls, 1);
        expect(r.cleared, isEmpty);
        _register(async, r);
        expect(r.devices.calls, 2, reason: '실패는 중복 제거 기록을 남기지 않는다');
        _register(async, r);
        expect(r.devices.calls, 3, reason: '두 번 실패한 뒤 세 번째 성공');
        _register(async, r);
        expect(r.devices.calls, 3, reason: '성공하면 기록한다');
      },
    );
  });
}
