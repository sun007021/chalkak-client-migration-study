/// 푸시 기기 등록 시작 지점. 실제 구현은 PUSH PR. 로그인 성공·인증 상태 앱 시작 때만
/// 호출되고, 실패는 호출한 쪽이 무시한다.
abstract interface class PushRegistrar {
  Future<void> registerCurrentDevice();
}
