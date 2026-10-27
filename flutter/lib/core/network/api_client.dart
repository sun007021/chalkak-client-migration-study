import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../auth/session_manager.dart';
import 'api_config.dart';
import 'api_request.dart';
import 'network_log_sink.dart';

class ApiClient {
  ApiClient({
    required ApiConfig config,
    required SessionManager sessions,
    HttpClientAdapter? adapter,
    NetworkLogSink? logSink,
  });

  /// JSON 응답을 [decode]로 변환한다. 2xx 외는 ApiError(server), 연결·타임아웃은
  /// network, 취소는 cancelled, 200인데 빈 본문·비 JSON Content-Type·깨진 JSON·
  /// [decode]가 던진 예외는 invalidResponse.
  Future<T> request<T>(
    ApiRequest request, {
    required T Function(Object? json) decode,
    CancelToken? cancelToken,
  }) => throw UnimplementedError();

  /// 본문이 필요 없는 요청(204 등). 성공 응답 본문은 디코딩하지 않는다.
  Future<void> requestNoContent(
    ApiRequest request, {
    CancelToken? cancelToken,
  }) => throw UnimplementedError();

  /// presigned PUT. 인증·공통 헤더 없이 [contentType]만, 타임아웃 60초.
  Future<void> putPresigned({
    required Uri url,
    required Uint8List bytes,
    required String contentType,
    CancelToken? cancelToken,
  }) => throw UnimplementedError();
}
