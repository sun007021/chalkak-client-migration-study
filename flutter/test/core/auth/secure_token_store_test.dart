import 'dart:io';

import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/core/auth/token_store.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fakes.dart';
import '../../support/net_harness.dart';

void main() {
  late FakeSecureKeyValueStore secure;
  late SecureTokenStore store;

  setUp(() {
    secure = FakeSecureKeyValueStore();
    store = SecureTokenStore(storage: secure);
  });

  test('TC-AUTH-052 저장한 세션을 그대로 읽어 온다', () async {
    final s = sessionAt();
    await store.write(s);
    final back = await store.read();
    expect(back, isNotNull);
    expect(back!.userId, s.userId);
    expect(back.accessToken, s.accessToken);
    expect(back.accessTokenExpiresAt, s.accessTokenExpiresAt);
    expect(back.refreshToken, s.refreshToken);
    expect(back.refreshTokenExpiresAt, s.refreshTokenExpiresAt);
    expect(back.isGuest, s.isGuest);
  });

  test('TC-AUTH-052 저장된 것이 없으면 null이다', () async {
    expect(await store.read(), isNull);
  });

  test('TC-AUTH-052 새 세션을 쓰면 이전 값을 덮어쓴다(access와 refresh가 함께 바뀐다)', () async {
    await store.write(sessionAt());
    await store.write(sessionAt(at: 'at2', rt: 'rt2'));
    final back = await store.read();
    expect((back!.accessToken, back.refreshToken), ('at2', 'rt2'));
  });

  test('TC-AUTH-052 clear 하면 읽기 결과가 null이다', () async {
    await store.write(sessionAt());
    await store.clear();
    expect(await store.read(), isNull);
  });

  test('TC-AUTH-053 토큰은 보안 저장소 인터페이스에만 기록된다', () async {
    await store.write(sessionAt(at: 'SECRET-AT', rt: 'SECRET-RT'));
    expect(secure.data, isNotEmpty);
    final stored = secure.data.values.join();
    expect(stored, contains('SECRET-AT'));
    expect(stored, contains('SECRET-RT'));
  });

  test('TC-AUTH-053 lib 소스가 평문 저장소(shared_preferences, 파일 쓰기)를 쓰지 않는다', () {
    final offenders = Directory('lib/core/auth')
        .listSync(recursive: true)
        .whereType<File>()
        .where((f) {
          final text = f.readAsStringSync();
          return text.contains('shared_preferences') ||
              text.contains('SharedPreferences') ||
              text.contains('writeAsString');
        })
        .map((f) => f.path);
    expect(offenders, isEmpty);
  });

  test('TC-AUTH-052 손상된 저장 값은 null로 읽고 지운다', () async {
    await store.write(sessionAt());
    secure.data.updateAll((k, v) => 'not-json{');
    expect(await store.read(), isNull);
    expect(secure.data, isEmpty);
  });

  test('TC-AUTH-052 게스트 세션도 저장·복원된다', () async {
    await store.write(Session.guest());
    expect((await store.read())!.isGuest, isTrue);
  });

  test(
    'TC-AUTH-052 보안 저장소 읽기가 예외를 던지면(Keystore 복원 실패) 세션 없음으로 보고 지운다',
    () async {
      final broken = _ThrowingReadStore();
      final s = SecureTokenStore(storage: broken);
      expect(await s.read(), isNull);
      expect(broken.deleted, isTrue);
    },
  );

  test('TC-AUTH-052 읽기도 지우기도 실패하면 예외 없이 세션 없음이다', () async {
    final broken = _ThrowingReadStore(deleteFails: true);
    expect(await SecureTokenStore(storage: broken).read(), isNull);
  });
}

class _ThrowingReadStore implements SecureKeyValueStore {
  _ThrowingReadStore({this.deleteFails = false});
  final bool deleteFails;
  bool deleted = false;

  @override
  Future<String?> read(String key) async => throw StateError('keystore');
  @override
  Future<void> write(String key, String value) async {}
  @override
  Future<void> delete(String key) async {
    deleted = true;
    if (deleteFails) throw StateError('keystore');
  }
}
