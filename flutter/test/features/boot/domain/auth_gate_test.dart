import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/core/auth/token_store.dart';
import 'package:chalkak/features/boot/domain/auth_gate.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/auth_fakes.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/fakes.dart';
import '../../../support/net_harness.dart';

class _Rig {
  _Rig(this.kv, this.store) : sessions = SessionManager(store: store) {
    gate = AuthGate(sessions: sessions);
  }

  final FakeSecureKeyValueStore kv;
  final SecureTokenStore store;
  final SessionManager sessions;
  late final AuthGate gate;

  static Future<_Rig> fromFixture(String name) async {
    final kv = FakeSecureKeyValueStore();
    return _Rig(kv, await seededStore(kv, 'boot/$name'));
  }
}

void main() {
  Future<T> inFixtureNow<T>(Future<T> Function() body) => atFixtureNow(body);

  test(
    'TC-BOOT-001 저장된 것이 없으면 SignedOut',
    () => inFixtureNow(() async {
      final r = await _Rig.fromFixture('session__empty.json');
      expect(await r.gate.resolve(), isA<SignedOut>());
    }),
  );

  test(
    'TC-BOOT-002 userId와 만료 전 refresh token이면 Authenticated',
    () => inFixtureNow(() async {
      final r = await _Rig.fromFixture('session__authenticated.json');
      final result = await r.gate.resolve();
      expect(result, isA<Authenticated>());
      expect(
        (result as Authenticated).session.userId,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );
    }),
  );

  test(
    'TC-BOOT-003 게스트 플래그만 있으면 GuestMode',
    () => inFixtureNow(() async {
      final r = await _Rig.fromFixture('session__guest.json');
      expect(await r.gate.resolve(), isA<GuestMode>());
    }),
  );

  test(
    'TC-BOOT-004 refresh 만료면 세션을 지우고 SignedOut',
    () => inFixtureNow(() async {
      final r = await _Rig.fromFixture('session__expired-refresh.json');
      expect(await r.gate.resolve(), isA<SignedOut>());
      expect(await r.store.read(), isNull, reason: '저장소가 비어야 한다');
    }),
  );

  test(
    'TC-BOOT-005 refresh 만료 경계: now-1초·now는 만료, now+1초는 유효',
    () => inFixtureNow(() async {
      for (final (offset, expectSignedOut) in [
        (-1, true),
        (0, true),
        (1, false),
      ]) {
        final store = FakeTokenStore(
          sessionAt(refreshLeft: Duration(seconds: offset)),
        );
        final gate = AuthGate(sessions: SessionManager(store: store));
        final result = await gate.resolve();
        expect(
          result,
          expectSignedOut ? isA<SignedOut>() : isA<Authenticated>(),
          reason: 'refresh 만료 now${offset >= 0 ? '+' : ''}$offset초',
        );
        expect(store.current == null, expectSignedOut);
      }
    }),
  );

  test(
    'TC-BOOT-006 userId만 있고 토큰 필드가 일부 없으면 지우고 SignedOut',
    () => inFixtureNow(() async {
      final r = await _Rig.fromFixture('session__partial.json');
      expect(await r.gate.resolve(), isA<SignedOut>());
      expect(r.kv.data, isEmpty);
    }),
  );

  test(
    'TC-BOOT-007 복호화할 수 없는 값은 크래시 없이 SignedOut이고 저장소를 정리한다',
    () => inFixtureNow(() async {
      final r = await _Rig.fromFixture('session__corrupted.json');
      expect(await r.gate.resolve(), isA<SignedOut>());
      expect(r.kv.data, isEmpty);
    }),
  );

  test(
    'TC-BOOT-007 저장소 읽기가 플랫폼 오류로 던져도 SignedOut',
    () => inFixtureNow(() async {
      final gate = AuthGate(sessions: SessionManager(store: _ThrowingStore()));
      expect(await gate.resolve(), isA<SignedOut>());
    }),
  );

  test(
    'TC-BOOT-008 인증 세션과 게스트 플래그가 같이 있으면 Authenticated(회원)이고 플래그를 고쳐 저장한다',
    () => inFixtureNow(() async {
      final r = await _Rig.fromFixture('session__authenticated-and-guest.json');
      final result = await r.gate.resolve();
      expect(result, isA<Authenticated>());
      expect((result as Authenticated).session.isGuest, isFalse);
      // ApiClient는 isGuest 세션에 토큰을 붙이지 않으므로 저장된 값도 회원이어야 한다.
      expect((await r.store.read())!.isGuest, isFalse);
    }),
  );

  test(
    'TC-BOOT-009 access만 만료되고 refresh가 유효하면 로그아웃하지 않고 Authenticated',
    () => inFixtureNow(() async {
      final r = await _Rig.fromFixture('session__access-expired.json');
      final result = await r.gate.resolve();
      expect(result, isA<Authenticated>());
      expect((await r.store.read())!.refreshToken, 'fixture-refresh-token-1');
    }),
  );

  test(
    'TC-BOOT-009 Authenticated 판정은 서버를 부르지 않는다(갱신은 첫 요청에서)',
    () => inFixtureNow(() async {
      final h = NetHarness(
        session: sessionAt(accessLeft: const Duration(minutes: -5)),
      );
      final result = await AuthGate(sessions: h.sessions).resolve();
      expect(result, isA<Authenticated>());
      expect(h.adapter.requests, isEmpty);
    }),
  );
}

class _ThrowingStore implements TokenStore {
  @override
  Future<void> clear() async {}
  @override
  Future<Session?> read() async => throw StateError('keystore');
  @override
  Future<void> write(Session session) async {}
}
