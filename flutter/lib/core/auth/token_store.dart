import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'session.dart';

abstract interface class TokenStore {
  Future<Session?> read();
  Future<void> write(Session session);
  Future<void> clear();
}

/// 플랫폼 보안 저장소(Keychain/Keystore)를 감싸는 문자열 키-값 인터페이스.
abstract interface class SecureKeyValueStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class FlutterSecureKeyValueStore implements SecureKeyValueStore {
  FlutterSecureKeyValueStore(this._storage);
  // ignore: unused_field
  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => throw UnimplementedError();
  @override
  Future<void> write(String key, String value) => throw UnimplementedError();
  @override
  Future<void> delete(String key) => throw UnimplementedError();
}

/// 세션 6종을 [SecureKeyValueStore] 하나의 키에 JSON으로 저장한다.
/// 읽을 수 없는(손상된) 값은 null로 보고 지운다.
class SecureTokenStore implements TokenStore {
  SecureTokenStore({required SecureKeyValueStore storage});

  @override
  Future<Session?> read() => throw UnimplementedError();
  @override
  Future<void> write(Session session) => throw UnimplementedError();
  @override
  Future<void> clear() => throw UnimplementedError();
}
