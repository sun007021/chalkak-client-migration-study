/// 늦게 도착한 응답을 버리는 공용 가드(TC-NET-056).
class LatestRequestGuard {
  /// [task]를 실행한다. 실행 중 다시 run/invalidate가 불려 더 이상 최신이 아니면 null.
  Future<T?> run<T>(Future<T> Function() task) => throw UnimplementedError();

  /// 진행 중인 모든 run 결과를 stale로 만든다(화면 상태·계정 변경).
  void invalidate() => throw UnimplementedError();
}
