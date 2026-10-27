import 'dart:convert';

import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/core/network/api_client.dart';
import 'package:chalkak/core/network/api_config.dart';
import 'package:chalkak/core/network/api_request.dart';
import 'package:dio/dio.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_adapter.dart';
import 'fakes.dart';

/// 모든 네트워크 테스트의 가상 시작 시각.
final DateTime t0 = DateTime.utc(2026, 10, 27, 3);

const String apiHost = 'https://api.test';
const String v1 = '/api/v1';

// fixture: common/error__unauthorized-token-invalid.json
final Map<String, Object?> unauthorizedBody = {
  'errorCode': 'UNAUTHORIZED',
  'message': '유효하지 않은 인증 정보입니다.',
};

// fixture: auth/refresh__reauthentication-required.json
final Map<String, Object?> reauthBody = {
  'errorCode': 'REAUTHENTICATION_REQUIRED',
  'message': '다시 로그인해 주세요.',
};

// fixture: common/error__internal-500.json
final Map<String, Object?> internalBody = {
  'errorCode': 'INTERNAL_ERROR',
  'message': '서버에서 요청을 처리하지 못했습니다.',
};

// fixture: common/error__business-400.json
final Map<String, Object?> businessBody = {
  'errorCode': 'BUSINESS_ERROR',
  'message': '요청을 처리할 수 없습니다.',
};

// fixture: auth/refresh__success.json
Map<String, Object?> refreshBody(String at, String rt) => {
  'accessToken': at,
  'expiresIn': 900,
  'refreshToken': rt,
  'refreshTokenExpiresIn': 2592000,
};

FakeResponse unauthorized() => FakeResponse.json(401, unauthorizedBody);
FakeResponse reauth() => FakeResponse.json(401, reauthBody);
FakeResponse ok([Object body = const {'ok': true}]) =>
    FakeResponse.json(200, body);

Session sessionAt({
  String at = 'at1',
  String rt = 'rt1',
  String userId = 'user-1',
  Duration accessLeft = const Duration(minutes: 15),
  Duration refreshLeft = const Duration(days: 30),
  DateTime? now,
}) {
  final base = now ?? t0;
  return Session(
    userId: userId,
    accessToken: at,
    accessTokenExpiresAt: base.add(accessLeft),
    refreshToken: rt,
    refreshTokenExpiresAt: base.add(refreshLeft),
  );
}

Session sessionGuest() => Session.guest();

/// Future 결과를 동기적으로 확인하기 위한 관찰자.
class Probe<T> {
  Probe(Future<T> future) {
    future.then<void>(
      (v) {
        done = true;
        value = v;
      },
      onError: (Object e, StackTrace s) {
        done = true;
        error = e;
      },
    );
  }

  bool done = false;
  T? value;
  Object? error;
  bool get succeeded => done && error == null;
}

class NetHarness {
  NetHarness({Session? session, String baseUrl = apiHost})
    : store = FakeTokenStore(session) {
    sessions = SessionManager(store: store);
    client = ApiClient(
      config: ApiConfig.parse(baseUrl),
      sessions: sessions,
      adapter: adapter,
      logSink: logs,
    );
    sessions.cleared.listen(clearedEvents.add);
  }

  final FakeAdapter adapter = FakeAdapter();
  final FakeTokenStore store;
  final FakeLogSink logs = FakeLogSink();
  final List<SessionClearReason> clearedEvents = [];
  late final SessionManager sessions;
  late final ApiClient client;

  int get refreshCalls => adapter.count('POST', '$v1/auth/refresh');

  List<String> get refreshTokensSent => adapter
      .where('POST', '$v1/auth/refresh')
      .map((r) => r.jsonBody!['refreshToken']! as String)
      .toList();

  /// 일반 JSON 객체 응답을 Map으로 받는 단축.
  static Map<String, Object?> asMap(Object? json) =>
      (json! as Map).cast<String, Object?>();

  Future<Map<String, Object?>> getJson(
    String path, {
    CancelToken? cancel,
    Map<String, String> query = const {},
  }) => client.request(
    ApiRequest.get(path, query: query),
    decode: asMap,
    cancelToken: cancel,
  );
}

/// dio는 제로 길이 Timer를 쓰므로 microtask만 비우면 진행하지 않는다.
/// 가상 시간은 흘리지 않고 대기 중인 작업을 끝까지 돌린다.
void settle(FakeAsync async) {
  for (var i = 0; i < 30; i++) {
    async.flushMicrotasks();
    async.elapse(Duration.zero);
  }
}

/// 가상 시간을 [d]만큼 흘리고 settle한다.
void advance(FakeAsync async, Duration d) {
  async.elapse(d);
  settle(async);
}

/// fakeAsync 안에서 하네스를 만들어 본문을 실행한다.
/// 실제 시간을 기다리지 않는다. 본문은 동기이며 Probe + async.elapse로 진행한다.
void netTest(
  String name,
  void Function(NetHarness h, FakeAsync async) body, {
  Session? session,
  String baseUrl = apiHost,
}) {
  test(name, () {
    fakeAsync((async) {
      final h = NetHarness(session: session, baseUrl: baseUrl);
      body(h, async);
      settle(async);
    }, initialTime: t0);
  });
}

String encode(Object o) => jsonEncode(o);
