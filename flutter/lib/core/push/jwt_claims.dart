/// 액세스 토큰(JWT) 클레임 판별. 서명은 검증하지 않는다(TC-PUSH-026).
abstract final class JwtClaims {
  /// payload에 `session_id` 클레임이 있으면 true.
  /// 점이 정확히 2개가 아님, base64 오류, payload가 JSON 객체가 아님은 모두 예외 없이 false.
  static bool hasSessionId(String token) => throw UnimplementedError();
}
