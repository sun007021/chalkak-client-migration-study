import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:clock/clock.dart';
import 'package:dio/dio.dart';

import 'fixtures.dart';

/// 어댑터가 받은 요청 기록.
class RecordedRequest {
  RecordedRequest({
    required this.method,
    required this.uri,
    required this.headers,
    required this.body,
    required this.connectTimeout,
    required this.receiveTimeout,
    required this.followRedirects,
    required this.at,
  });

  final String method;
  final Uri uri;

  /// 소문자 키.
  final Map<String, String> headers;
  final String? body;
  final Duration? connectTimeout;
  final Duration? receiveTimeout;
  final bool followRedirects;

  /// 요청이 어댑터에 도착한 (가상) 시각.
  final DateTime at;

  String get path => uri.path;
  String? header(String name) => headers[name.toLowerCase()];
  bool get hasAuthorization => headers.containsKey('authorization');

  Map<String, Object?>? get jsonBody {
    final b = body;
    if (b == null || b.isEmpty) return null;
    return (jsonDecode(b) as Map).cast<String, Object?>();
  }

  /// 이 요청이 가는 `/api/v1` 뒤 경로(없으면 전체 경로).
  String get apiPath =>
      path.startsWith('/api/v1') ? path.substring('/api/v1'.length) : path;
}

enum FakeFault { timeout, disconnect }

/// 스크립트된 응답. 본문이 아닌 응답은 fixture 예약 키(`_raw`, `_contentType`,
/// `_fault`)와 같은 모양으로 만들 수 있다([FakeResponse.fixture]).
class FakeResponse {
  const FakeResponse({
    this.status = 200,
    this.body,
    this.contentType = 'application/json; charset=utf-8',
    this.headers = const {},
    this.connectDelay = Duration.zero,
    this.delay = Duration.zero,
    this.fault,
    this.throwable,
  });

  FakeResponse.json(
    int status,
    Object body, {
    Map<String, String> headers = const {},
    Duration delay = Duration.zero,
  }) : this(
         status: status,
         body: jsonEncode(body),
         headers: headers,
         delay: delay,
       );

  /// 본문 없는 응답(204 등).
  const FakeResponse.empty(int status, {Map<String, String> headers = const {}})
    : this(status: status, body: '', headers: headers);

  const FakeResponse.fault(FakeFault fault) : this(fault: fault);

  /// 어댑터가 임의 예외(SocketException 등)를 던진다.
  const FakeResponse.throwing(Object error) : this(throwable: error);

  /// `shared/fixtures/<name>`을 manifest의 상태·헤더와 함께 응답으로 만든다.
  /// `_raw`/`_contentType`/`_fault` 해석은 [Fixture.response]가 맡는다.
  factory FakeResponse.fixture(
    String name, {
    Duration delay = Duration.zero,
    Map<String, String>? headers,
  }) {
    final f = Fixture.response(name);
    if (f.fault != null) {
      return FakeResponse.fault(
        f.fault == 'timeout' ? FakeFault.timeout : FakeFault.disconnect,
      );
    }
    return FakeResponse(
      status: f.route.status ?? 200,
      body: f.bodyText,
      contentType: f.contentType ?? 'application/json',
      headers: headers ?? f.route.headers,
      delay: delay,
    );
  }

  final int status;
  final String? body;
  final String contentType;
  final Map<String, String> headers;

  /// 연결 단계에 걸리는 시간. connectTimeout보다 길면 연결 타임아웃.
  final Duration connectDelay;

  /// 응답 도착까지 걸리는 시간. receiveTimeout보다 길면 응답 타임아웃.
  final Duration delay;
  final FakeFault? fault;
  final Object? throwable;

  FakeResponse withDelay(Duration d) => FakeResponse(
    status: status,
    body: body,
    contentType: contentType,
    headers: headers,
    connectDelay: connectDelay,
    delay: d,
    fault: fault,
    throwable: throwable,
  );
}

typedef FakeResponder = FutureOr<FakeResponse> Function(RecordedRequest r);

/// dio [HttpClientAdapter]를 대신하는 Fake. 요청을 기록하고 스크립트대로 응답한다.
/// 지연·타임아웃은 Future.delayed로 흉내 내므로 fake_async와 함께 쓴다.
class FakeAdapter implements HttpClientAdapter {
  final List<RecordedRequest> requests = [];
  final List<_Route> _routes = [];

  /// `METHOD /api/v1/...` 전체 경로(쿼리 제외)에 응답을 순서대로 건다.
  /// 마지막 응답은 반복된다(repeatLast).
  void on(String method, String path, List<FakeResponse> responses) {
    _routes.add(_Route(method.toUpperCase(), path, queue: [...responses]));
  }

  /// 요청마다 계산하는 응답.
  void onDynamic(String method, String path, FakeResponder responder) {
    _routes.add(_Route(method.toUpperCase(), path, responder: responder));
  }

  Iterable<RecordedRequest> where(String method, String path) =>
      requests.where((r) => r.method == method.toUpperCase() && r.path == path);

  int count(String method, String path) => where(method, path).length;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    String? body;
    if (requestStream != null) {
      final bytes = <int>[];
      await for (final chunk in requestStream) {
        bytes.addAll(chunk);
      }
      body = utf8.decode(bytes);
    }
    final rec = RecordedRequest(
      method: options.method.toUpperCase(),
      uri: options.uri,
      headers: {
        for (final e in options.headers.entries)
          e.key.toLowerCase(): '${e.value}',
      },
      body: body,
      connectTimeout: options.connectTimeout,
      receiveTimeout: options.receiveTimeout,
      followRedirects: options.followRedirects,
      at: clock.now(),
    );
    requests.add(rec);

    final route = _routes.cast<_Route?>().firstWhere(
      (r) => r!.method == rec.method && r.path == rec.path,
      orElse: () => null,
    );
    if (route == null) {
      throw StateError('FakeAdapter: 스크립트 없는 요청 ${rec.method} ${rec.path}');
    }
    final resp = await route.next(rec);

    Future<void> wait(Duration d) {
      if (d == Duration.zero) return Future<void>.value();
      final delayed = Future<void>.delayed(d);
      if (cancelFuture == null) return delayed;
      return Future.any<void>([
        delayed,
        cancelFuture.then<void>(
          (_) => throw DioException.requestCancelled(
            requestOptions: options,
            reason: 'cancelled',
          ),
        ),
      ]);
    }

    DioException timeout(DioExceptionType type) =>
        DioException(requestOptions: options, type: type);

    if (resp.fault == FakeFault.timeout) {
      await wait(options.connectTimeout ?? Duration.zero);
      throw timeout(DioExceptionType.connectionTimeout);
    }
    if (resp.fault == FakeFault.disconnect) {
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'disconnect',
      );
    }
    if (resp.throwable != null) throw resp.throwable!;

    final ct = options.connectTimeout;
    if (ct != null && resp.connectDelay > ct) {
      await wait(ct);
      throw timeout(DioExceptionType.connectionTimeout);
    }
    await wait(resp.connectDelay);
    final rt = options.receiveTimeout;
    if (rt != null && resp.delay > rt) {
      await wait(rt);
      throw timeout(DioExceptionType.receiveTimeout);
    }
    await wait(resp.delay);

    return ResponseBody.fromString(
      resp.body ?? '',
      resp.status,
      headers: {
        Headers.contentTypeHeader: [resp.contentType],
        for (final e in resp.headers.entries) e.key.toLowerCase(): [e.value],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class _Route {
  _Route(this.method, this.path, {this.queue, this.responder});
  final String method;
  final String path;
  final List<FakeResponse>? queue;
  final FakeResponder? responder;

  FutureOr<FakeResponse> next(RecordedRequest r) {
    if (responder != null) return responder!(r);
    final q = queue!;
    return q.length > 1 ? q.removeAt(0) : q.first;
  }
}
