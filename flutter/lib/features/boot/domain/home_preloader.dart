/// 스플래시 동안 홈 데이터를 미리 읽는다. 실제 구현은 HOME PR.
/// 오류로 끝나면 [preload]가 던져도 된다(부트는 즉시 스플래시를 해제하고 홈이 오류 상태를 그린다).
abstract interface class HomePreloader {
  /// [guest]면 공개 데이터(랭킹, 배너)만 읽고 인증이 필요한 호출은 하지 않는다.
  Future<void> preload({required bool guest});
}
