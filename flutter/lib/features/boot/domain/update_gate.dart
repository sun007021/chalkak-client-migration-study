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
    required this._checker,
    required this._launcher,
    required this._enabled,
    required this._exit,
    required this.cancelAvailable,
    Stream<void>? recheckSignals,
  }) {
    _signalSubscription = recheckSignals?.listen((_) => unawaited(check()));
  }

  final UpdateChecker _checker;
  final UpdateLauncher _launcher;
  final bool _enabled;
  final AppExit _exit;

  /// "취소" 버튼을 보이는 플랫폼 정책(Android true, iOS false). 주입값이다.
  final bool cancelAvailable;
  StreamSubscription<void>? _signalSubscription;
  UpdateGateStatus _status = UpdateGateStatus.checking;
  Future<void>? _checking;
  Future<void>? _opening;

  UpdateGateStatus get status => _status;

  /// 동시에 여러 번 불려도 조회는 한 번에 하나만 진행한다.
  Future<void> check() =>
      _checking ??= _check().whenComplete(() => _checking = null);

  Future<void> _check() async {
    if (!_enabled) {
      _setStatus(UpdateGateStatus.passed);
      return;
    }
    UpdateStatus result;
    try {
      result = await _checker.check();
    } on Object {
      result = UpdateStatus.unavailable;
    }
    switch (result) {
      case UpdateStatus.updateRequired:
        _setStatus(UpdateGateStatus.forced);
      case UpdateStatus.upToDate:
        _setStatus(UpdateGateStatus.passed);
      case UpdateStatus.unavailable:
        if (_status != UpdateGateStatus.forced) {
          _setStatus(UpdateGateStatus.passed);
        }
    }
  }

  void _setStatus(UpdateGateStatus next) {
    if (_status == next) return;
    _status = next;
    notifyListeners();
  }

  /// "업데이트" 버튼. 진행 중이면 무시(연타해도 launcher 1회). 스토어를 열었든 아니든 다이얼로그는
  /// 닫히지 않고, 돌아온 뒤에도 강제 상태가 남아 있으면 forced 유지. 어떤 스토어 주소도 열지 못하면
  /// [cancelAvailable]인 플랫폼(Android)에서는 앱을 종료한다.
  Future<void> openStore() =>
      _opening ??= _open().whenComplete(() => _opening = null);

  Future<void> _open() async {
    var opened = false;
    try {
      opened = await _launcher.launch();
    } on Object {
      opened = false;
    }
    if (!opened && cancelAvailable) await _quit();
  }

  /// "취소" 버튼. [cancelAvailable]인 플랫폼(Android)에서만 앱을 종료한다. iOS는 아무 일도 없다.
  Future<void> cancel() async {
    if (cancelAvailable) await _quit();
  }

  Future<void> _quit() async {
    try {
      await _exit.exit();
    } on Object {
      // 종료 호출이 실패해도 강제 상태는 그대로 둔다.
    }
  }

  @override
  void dispose() {
    _signalSubscription?.cancel();
    super.dispose();
  }
}
