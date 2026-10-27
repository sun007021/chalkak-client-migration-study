/// 푸시 기기 등록 시작 지점. 실제 구현은 PUSH PR. 로그인 성공·인증 상태 앱 시작 때만
/// 호출되고, 실패는 호출한 쪽이 무시한다.
abstract interface class PushRegistrar {
  Future<void> registerCurrentDevice();
}

extension PushRegistrationStart on PushRegistrar {
  /// 등록을 시작만 하고 기다리지 않는다. 동기 예외와 비동기 실패는 모두 무시한다.
  void startRegistration() {
    try {
      registerCurrentDevice().catchError((Object _) {});
    } on Object {
      // 푸시 등록 실패는 로그인·가입 결과에 영향을 주지 않는다.
    }
  }
}
