import 'dart:async';
import 'dart:typed_data';

import 'package:clock/clock.dart';
import 'package:dio/dio.dart';

import '../auth/session.dart';
import '../auth/session_manager.dart';
import 'api_config.dart';
import 'api_error.dart';
import 'api_request.dart';
import 'authorization_policy.dart';
import 'body_decoder.dart';
import 'http_transport.dart';
import 'network_config.dart';
import 'network_log_sink.dart';
import 'retry_policy.dart';
import 'token_refresher.dart';
import 'url_rule.dart';

class ApiClient {
  ApiClient({
    required ApiConfig config,
    required SessionManager sessions,
    HttpClientAdapter? adapter,
    NetworkLogSink? logSink,
  }) : _apiRoot = config.apiRoot,
       _sessions = sessions,
       _transport = HttpTransport(adapter: adapter, logSink: logSink) {
    _refresher = TokenRefresher(
      transport: _transport,
      sessions: sessions,
      apiRoot: _apiRoot,
    );
  }

  final Uri _apiRoot;
  final SessionManager _sessions;
  final HttpTransport _transport;
  late final TokenRefresher _refresher;

  /// JSON 응답을 [decode]로 변환한다. 2xx 외는 ApiError(server), 연결·타임아웃은
  /// network, 취소는 cancelled, 200인데 빈 본문·비 JSON Content-Type·깨진 JSON·
  /// [decode]가 던진 예외는 invalidResponse.
  Future<T> request<T>(
    ApiRequest request, {
    required T Function(Object? json) decode,
    CancelToken? cancelToken,
  }) async {
    final raw = await _call(request, cancelToken);
    return BodyDecoder.decode(raw, decode);
  }

  /// 본문이 필요 없는 요청(204 등). 성공 응답 본문은 디코딩하지 않는다.
  Future<void> requestNoContent(
    ApiRequest request, {
    CancelToken? cancelToken,
  }) async {
    await _call(request, cancelToken);
  }

  /// presigned PUT. 인증·공통 헤더 없이 [contentType]만, 타임아웃 60초.
  /// URL은 https(또는 loopback의 http)여야 하며 아니면 요청 없이 config 오류.
  /// PUT은 멱등이므로 네트워크 오류·5xx에 재시도한다(D-21).
  Future<void> putPresigned({
    required Uri url,
    required Uint8List bytes,
    required String contentType,
    CancelToken? cancelToken,
  }) async {
    if (!UrlRule.isAllowed(url)) {
      throw ApiError.config('presigned URL은 https여야 한다(loopback만 http 허용)');
    }
    await _transport.send(
      TransportRequest(
        method: HttpMethod.put,
        uri: url,
        bytes: bytes,
        contentType: contentType,
        connectTimeout: NetworkConfig.presignedPutTimeout,
        receiveTimeout: NetworkConfig.presignedPutTimeout,
        retry: true,
        cancelToken: cancelToken,
      ),
    );
  }

  Uri _url(ApiRequest r) => _apiRoot.replace(
    path: '${_apiRoot.path}${r.path}',
    queryParameters: r.query.isEmpty ? null : r.query,
  );

  /// 인증 헤더·401 갱신·재전송까지 포함한 API 호출.
  Future<RawResponse> _call(ApiRequest request, CancelToken? cancel) async {
    final used = await _sessions.read();
    try {
      return await _sendAs(request, used, cancel);
    } on ApiError catch (error) {
      final resend = await _recover(error, request, used, cancel);
      if (resend == null) rethrow;
      return _resend(request, resend, cancel);
    }
  }

  Future<RawResponse> _sendAs(
    ApiRequest request,
    Session? session,
    CancelToken? cancel,
  ) {
    final uri = _url(request);
    final attach = AuthorizationPolicy.attaches(
      url: uri,
      method: request.method,
      session: session,
      now: clock.now(),
    );
    return _transport.send(
      TransportRequest(
        method: request.method,
        uri: uri,
        headers: {
          'Accept': 'application/json',
          if (attach) 'Authorization': 'Bearer ${session!.accessToken}',
        },
        jsonBody: request.body,
        retry: RetryPolicy.isRetryable(request.method, request.path),
        cancelToken: cancel,
      ),
    );
  }

  /// 원 요청의 1회 재전송. 두 번째 401은 그대로 돌려주고, REAUTH면 세션을 지운다.
  Future<RawResponse> _resend(
    ApiRequest request,
    Session session,
    CancelToken? cancel,
  ) async {
    try {
      return await _sendAs(request, session, cancel);
    } on ApiError catch (error) {
      if (error.isReauthenticationRequired) await _clearSession(session);
      rethrow;
    }
  }

  /// 오류를 보고 같은 요청을 다시 보낼 세션을 정한다. 재전송하지 않으면 null.
  /// 갱신이 필요하면 refresh(single-flight)를 기다린다.
  Future<Session?> _recover(
    ApiError error,
    ApiRequest request,
    Session? used,
    CancelToken? cancel,
  ) async {
    if (error.status != 401 || !_canRecover(request, used)) return null;
    final sent = used!;
    final current = await _sessions.read();
    if (current == null || current.isGuest || current.userId != sent.userId) {
      return null;
    }
    // 응답을 기다리는 사이 다른 요청이 이미 토큰을 바꿨다면 새 토큰으로 다시 보낸다.
    if (current.refreshToken != sent.refreshToken) return current;
    if (error.isReauthenticationRequired) {
      await _clearSession(sent);
      return null;
    }
    if (!error.isUnauthorized) return null;
    return _awaitRefresh(sent, cancel);
  }

  bool _canRecover(ApiRequest request, Session? used) {
    if (used == null || used.isGuest) return false;
    if (AuthorizationPolicy.isExcluded(request.method, request.path)) {
      return false;
    }
    return !used.isRefreshExpired(clock.now());
  }

  Future<Session> _awaitRefresh(Session stale, CancelToken? cancel) {
    final refreshing = _refresher.refresh(stale);
    if (cancel == null) return refreshing;
    // 취소하면 이 요청만 즉시 빠지고 refresh는 다른 대기자를 위해 계속된다.
    return Future.any<Session>([
      refreshing,
      cancel.whenCancel.then<Session>((_) => throw ApiError.cancelled()),
    ]);
  }

  Future<void> _clearSession(Session sent) async {
    await _sessions.clearIfCurrent(
      sent,
      SessionClearReason.reauthenticationRequired,
    );
  }
}
