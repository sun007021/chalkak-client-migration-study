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

/// "업데이트" 버튼의 동작. 두 플랫폼 모두 스토어 페이지를 직접 연다.
/// 열었으면 true, 어디도 열지 못했으면 false(예외도 false로 취급한다).
abstract interface class UpdateLauncher {
  Future<bool> launch();
}

/// "취소" 버튼(Android)과 스토어를 열 수 없을 때의 앱 종료. 플랫폼 호출을 감싼다.
abstract interface class AppExit {
  Future<void> exit();
}
