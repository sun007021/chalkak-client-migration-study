/// FCM 토큰 공급자. SDK 패키지는 구현 PR에서 이 인터페이스 뒤에 붙인다.
/// 토큰 원문은 로그·분석·화면에 출력하지 않는다(REQ-PUSH-018).
abstract interface class PushTokenProvider {
  /// SDK가 지금 가진 토큰. 아직 없으면 null.
  Future<String?> currentToken();

  /// 토큰이 새로 발급·갱신될 때마다 새 값을 낸다(onNewToken, tokenRefresh).
  Stream<String> get tokenRefreshed;
}
