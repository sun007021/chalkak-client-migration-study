import 'dart:convert';

import 'api_error.dart';
import 'http_transport.dart';

/// 2xx 응답 본문을 JSON으로 읽어 모델로 바꾼다. 본문이 없거나 JSON이 아니거나
/// [decode]가 던지면 모두 invalidResponse다(TC-NET-005~011).
class BodyDecoder {
  const BodyDecoder._();

  static T decode<T>(RawResponse raw, T Function(Object? json) decode) {
    final type = raw.contentType?.toLowerCase() ?? '';
    if (raw.status == 204 || raw.body.isEmpty || !type.contains('json')) {
      throw ApiError.invalidResponse(status: raw.status);
    }
    final Object? json;
    try {
      json = jsonDecode(raw.body);
    } on FormatException catch (e) {
      throw ApiError.invalidResponse(status: raw.status, cause: e);
    }
    try {
      return decode(json);
    } on ApiError {
      rethrow;
    } on Object catch (e) {
      throw ApiError.invalidResponse(status: raw.status, cause: e);
    }
  }
}
