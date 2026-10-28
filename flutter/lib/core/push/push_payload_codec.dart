import 'dart:convert';

import 'push_payload.dart';

/// [PushPayload]를 로컬 알림 payload 문자열로 실었다가 푸시 탭으로 되돌린다.
/// 깨진 문자열은 예외 없이 null이다(앱이 모르는 payload를 받아도 크래시하지 않는다).
abstract final class PushPayloadCodec {
  static String encode(PushPayload payload) => jsonEncode(payload.toData());

  static PushPayload? decode(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    try {
      final json = jsonDecode(raw);
      if (json is! Map) return null;
      return PushPayload.fromData(json.cast<Object?, Object?>());
    } on Object {
      return null;
    }
  }
}
