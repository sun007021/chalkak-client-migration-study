import 'dart:convert';

/// 액세스 토큰(JWT) 클레임 판별. 서명은 검증하지 않는다(TC-PUSH-026).
abstract final class JwtClaims {
  /// payload에 `session_id` 클레임이 있으면 true.
  /// 점이 정확히 2개가 아님, base64 오류, payload가 JSON 객체가 아님은 모두 예외 없이 false.
  static bool hasSessionId(String token) {
    final parts = token.split('.');
    if (parts.length != 3) return false;
    try {
      final payload = utf8.decode(
        base64Url.decode(base64Url.normalize(parts[1])),
      );
      final json = jsonDecode(payload);
      return json is Map && json.containsKey('session_id');
    } on Object {
      // 형식 오류는 모두 "클레임 없음"이다. 토큰 내용은 로그에 남기지 않는다.
      return false;
    }
  }
}
