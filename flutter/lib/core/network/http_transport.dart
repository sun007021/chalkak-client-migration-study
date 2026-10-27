import 'dart:async';
import 'dart:typed_data';

import 'package:clock/clock.dart';
import 'package:dio/dio.dart';

import 'api_error.dart';
import 'api_request.dart';
import 'network_config.dart';
import 'network_log_sink.dart';
import 'retry_policy.dart';

/// [HttpTransport]에 보내 달라고 하는 한 건의 HTTP 요청. 인증·URL 규칙은 호출자 몫이다.
class TransportRequest {
  const TransportRequest({
    required this.method,
    required this.uri,
    this.headers = const {},
    this.jsonBody,
    this.bytes,
    this.contentType,
    this.connectTimeout = NetworkConfig.connectTimeout,
    this.receiveTimeout = NetworkConfig.receiveTimeout,
    this.retry = false,
    this.cancelToken,
  });

  final HttpMethod method;
  final Uri uri;
  final Map<String, String> headers;

  /// JSON으로 직렬화할 본문(보내면 Content-Type은 application/json).
  final Map<String, Object?>? jsonBody;

  /// 원문 바이트 본문([contentType] 필수).
  final Uint8List? bytes;
  final String? contentType;
  final Duration connectTimeout;
  final Duration receiveTimeout;

  /// 멱등 요청이면 네트워크 오류·5xx에 백오프 재시도한다(D-21).
  final bool retry;
  final CancelToken? cancelToken;
}

class RawResponse {
  const RawResponse({
    required this.status,
    required this.body,
    required this.contentType,
  });

  final int status;
  final String body;
  final String? contentType;
}

/// dio 위의 얇은 층. 2xx가 아니거나 연결이 실패하면 [ApiError]로 바꿔 던지고,
/// 재시도·취소·로그를 맡는다. 리다이렉트는 따라가지 않는다.
class HttpTransport {
  HttpTransport({HttpClientAdapter? adapter, NetworkLogSink? logSink})
    : _log = logSink,
      _dio = Dio(
        BaseOptions(
          connectTimeout: NetworkConfig.connectTimeout,
          receiveTimeout: NetworkConfig.receiveTimeout,
          responseType: ResponseType.plain,
          followRedirects: false,
          validateStatus: _isSuccess,
        ),
      ) {
    if (adapter != null) _dio.httpClientAdapter = adapter;
  }

  final Dio _dio;
  final NetworkLogSink? _log;

  static bool _isSuccess(int? status) =>
      status != null && status >= 200 && status < 300;

  Future<RawResponse> send(TransportRequest request) async {
    final waits = NetworkConfig.retryBackoffs;
    for (var attempt = 0; ; attempt++) {
      try {
        return await _once(request);
      } on _Failure catch (failure) {
        final error = failure.error;
        final wait = request.retry && attempt < waits.length
            ? _retryDelay(failure, waits[attempt])
            : null;
        if (wait == null) throw error;
        _note(request, 'retry ${attempt + 1} after ${wait.inMilliseconds}ms');
        await _sleep(wait, request.cancelToken);
      }
    }
  }

  /// 재시도하지 않으면 null. 429·503은 Retry-After가 있으면 그만큼, 없으면 503만 백오프.
  Duration? _retryDelay(_Failure failure, Duration backoff) {
    final error = failure.error;
    if (error.isNetwork) return backoff;
    final status = error.status;
    if (status == null) return null;
    if (status == 429 || status == 503) {
      final advised = RetryPolicy.parseRetryAfter(
        failure.retryAfter,
        now: clock.now(),
      );
      if (advised != null) return advised;
      return status == 503 ? backoff : null;
    }
    return status >= 500 ? backoff : null;
  }

  Future<RawResponse> _once(TransportRequest r) async {
    final token = r.cancelToken;
    if (token != null && token.isCancelled) {
      throw _Failure(ApiError.cancelled());
    }
    final headers = {...r.headers};
    Object? data;
    if (r.bytes != null) {
      data = Stream<Uint8List>.value(r.bytes!);
      headers[Headers.contentLengthHeader] = '${r.bytes!.length}';
    } else {
      data = r.jsonBody;
    }
    try {
      final response = await _dio.request<String>(
        r.uri.toString(),
        data: data,
        cancelToken: token,
        options: Options(
          method: r.method.wire,
          headers: headers,
          contentType: r.bytes != null
              ? r.contentType
              : (r.jsonBody != null ? Headers.jsonContentType : null),
          connectTimeout: r.connectTimeout,
          receiveTimeout: r.receiveTimeout,
          sendTimeout: r.bytes != null ? r.receiveTimeout : null,
        ),
      );
      _note(r, '${response.statusCode}');
      return RawResponse(
        status: response.statusCode ?? 0,
        body: response.data ?? '',
        contentType: response.headers.value(Headers.contentTypeHeader),
      );
    } on DioException catch (e) {
      final failure = _map(e);
      _note(r, failure.error.isNetwork ? 'network' : '${failure.error.status}');
      throw failure;
    } on ApiError catch (e) {
      throw _Failure(e);
    } on Object catch (e) {
      // 어댑터가 던진 SocketException·TLS 오류 등은 dio 밖으로 새기도 한다.
      _note(r, 'network');
      throw _Failure(ApiError.network(e));
    }
  }

  _Failure _map(DioException e) {
    switch (e.type) {
      case DioExceptionType.cancel:
        return _Failure(ApiError.cancelled());
      case DioExceptionType.badResponse:
        final response = e.response;
        final body = response?.data;
        return _Failure(
          ApiError.fromErrorResponse(
            response?.statusCode ?? 0,
            body is String ? body : null,
          ),
          retryAfter: response?.headers.value('retry-after'),
        );
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.transformTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.connectionError:
      case DioExceptionType.badCertificate:
      case DioExceptionType.unknown:
        return _Failure(ApiError.network(e.error ?? e.type));
    }
  }

  /// 요청 경로만 남긴다. 쿼리(presigned 서명)·헤더·본문은 기록하지 않는다.
  void _note(TransportRequest r, String what) =>
      _log?.log('${r.method.wire} ${r.uri.path} $what');

  Future<void> _sleep(Duration d, CancelToken? token) async {
    final delay = Future<void>.delayed(d);
    if (token == null) return delay;
    await Future.any<void>([
      delay,
      token.whenCancel.then<void>((_) => throw ApiError.cancelled()),
    ]);
  }
}

class _Failure implements Exception {
  const _Failure(this.error, {this.retryAfter});
  final ApiError error;
  final String? retryAfter;
}
