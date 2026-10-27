enum UpdateStatus {
  /// 최신이거나 patch만 높음/업데이트 불필요.
  upToDate,

  /// 강제 업데이트 필요.
  updateRequired,

  /// 조회 실패·오프라인·응답 해석 불가. 앱을 막지 않는다(D-15).
  unavailable,
}

/// 스토어 조회 방식을 감싼다. iOS는 iTunes lookup, Android는 Play In-App Update.
/// 구현은 예외를 던지지 않고 [UpdateStatus.unavailable]로 돌려준다.
abstract interface class UpdateChecker {
  Future<UpdateStatus> check();
}

/// "업데이트" 버튼의 동작. iOS는 스토어 열기, Android는 Play 즉시 업데이트 시작.
/// 실패·취소는 예외로 알려도 되고, 게이트는 어느 쪽이든 강제 상태를 유지한다.
abstract interface class UpdateLauncher {
  Future<void> launch();
}
