import 'dart:convert';

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
  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);
  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);
  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

/// 세션 6종을 [SecureKeyValueStore] 하나의 키에 JSON으로 저장한다.
/// 읽을 수 없는(손상된) 값은 null로 보고 지운다.
class SecureTokenStore implements TokenStore {
  SecureTokenStore({required this._storage});

  static const String _key = 'chalkak.session.v1';
  final SecureKeyValueStore _storage;

  @override
  Future<Session?> read() async {
    final raw = await _storage.read(_key);
    if (raw == null) return null;
    try {
      final json = jsonDecode(raw);
      if (json is! Map) throw const FormatException('세션이 객체가 아니다');
      return Session.fromJson(json.cast<String, Object?>());
    } on FormatException {
      await _storage.delete(_key);
      return null;
    }
  }

  @override
  Future<void> write(Session session) =>
      _storage.write(_key, jsonEncode(session.toJson()));

  @override
  Future<void> clear() => _storage.delete(_key);
}
