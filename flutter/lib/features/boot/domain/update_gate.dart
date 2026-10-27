import 'dart:async';

import 'package:flutter/foundation.dart';

import 'update_checker.dart';

enum UpdateGateStatus {
  /// 아직 확인 전이거나 확인 중. 스플래시를 유지한다.
  checking,

  /// 통과(최신, 조회 실패, 오프라인, 설정으로 꺼짐).
  passed,

  /// 강제 업데이트 필요. 닫을 수 없는 다이얼로그를 보인다.
  forced,
}

/// 강제 업데이트 게이트(D-15, REQ-BOOT-005~014).
/// - [enabled]가 false면 [checker]를 부르지 않고 통과한다(`FORCE_UPDATE_CHECK_ENABLED`).
/// - 한 번 forced가 되면 이후 조회가 unavailable이어도 forced를 유지한다.
/// - [recheckSignals]에 이벤트가 오면(앱 복귀, 온라인 전환) [check]를 다시 한다.
class UpdateGate extends ChangeNotifier {
  UpdateGate({
    required UpdateChecker checker,
    required UpdateLauncher launcher,
    required bool enabled,
    Stream<void>? recheckSignals,
  });

  UpdateGateStatus get status => throw UnimplementedError();

  /// 동시에 여러 번 불려도 조회는 한 번에 하나만 진행한다.
  Future<void> check() => throw UnimplementedError();

  /// "업데이트" 버튼. 진행 중이면 무시(연타해도 launcher 1회). 끝난 뒤에도
  /// 강제 상태가 남아 있으면 forced 유지(Android 취소·실패 포함, 앱을 종료하지 않는다).
  Future<void> openStore() => throw UnimplementedError();
}
