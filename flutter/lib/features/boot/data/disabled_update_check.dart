import '../domain/update_checker.dart';

/// 강제 업데이트 실제 조회를 쓰지 않는 동안의 자리(D-15, 스토어 미배포).
/// 게이트가 꺼져 있으면 호출되지 않고, 켜져 있어도 항상 통과시킨다.
class DisabledUpdateChecker implements UpdateChecker {
  const DisabledUpdateChecker();

  @override
  Future<UpdateStatus> check() async => UpdateStatus.upToDate;
}

class DisabledUpdateLauncher implements UpdateLauncher {
  const DisabledUpdateLauncher();

  @override
  Future<void> launch() async {}
}
