import 'dart:async';

import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/core/auth/token_store.dart';
import 'package:chalkak/core/network/network_log_sink.dart';

/// 메모리 TokenStore. [writeGate]를 주면 write가 그 Future가 끝날 때까지 지연된다.
class FakeTokenStore implements TokenStore {
  FakeTokenStore([this.current]);

  Session? current;
  final List<Session> writes = [];
  int clears = 0;
  Future<void>? writeGate;

  @override
  Future<Session?> read() async => current;

  @override
  Future<void> write(Session session) async {
    final gate = writeGate;
    if (gate != null) await gate;
    writes.add(session);
    current = session;
  }

  @override
  Future<void> clear() async {
    clears++;
    current = null;
  }
}

class FakeSecureKeyValueStore implements SecureKeyValueStore {
  final Map<String, String> data = {};

  @override
  Future<String?> read(String key) async => data[key];

  @override
  Future<void> write(String key, String value) async => data[key] = value;

  @override
  Future<void> delete(String key) async => data.remove(key);
}

class FakeLogSink implements NetworkLogSink {
  final List<String> lines = [];

  @override
  void log(String message) => lines.add(message);

  String get all => lines.join('\n');
}
