import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/constants/app_constants.dart';
import '../../auth/domain/push_registrar.dart';
import 'auth_gate.dart';
import 'home_preloader.dart';
import 'update_gate.dart';

enum BootDestination { login, home }

sealed class BootState {
  const BootState();
}

/// 스플래시 유지 중(게이트 확인, 세션 읽기, 프리로드).
final class BootChecking extends BootState {
  const BootChecking();
}

/// 강제 업데이트 다이얼로그. 이 상태에서는 인증 게이트·프리로드·푸시 등록을 하지 않는다.
final class BootForceUpdate extends BootState {
  const BootForceUpdate();
}

/// 스플래시 해제. [isGuest]는 destination이 home일 때만 의미가 있다.
final class BootReady extends BootState {
  const BootReady(this.destination, {this.isGuest = false});
  final BootDestination destination;
  final bool isGuest;
}

/// 스플래시 → 강제 업데이트 게이트 → 인증 게이트 순서(REQ-BOOT-001~004, 016).
/// - 세션 없음이면 프리로드를 기다리지 않고 바로 login.
/// - member/guest면 [homePreloader]를 부르고 끝나거나 [preloadMax](기본
///   `AppConstants.splashPreloadMax`)가 지나면 home. 프리로드 오류도 즉시 home.
///   상한은 프리로드를 시작한 시점부터 잰다.
/// - member면 홈이 준비되는 것과 별개로 [pushRegistrar]를 한 번 부른다(실패 무시).
/// - forced면 [BootForceUpdate]에서 멈추고, 게이트가 통과로 바뀌면 이어서 진행한다.
class BootViewModel extends ChangeNotifier {
  BootViewModel({
    required this._updateGate,
    required this._authGate,
    required this._homePreloader,
    required this._pushRegistrar,
    Duration? preloadMax,
  }) : _preloadMax = preloadMax ?? AppConstants.splashPreloadMax;

  final UpdateGate _updateGate;
  final AuthGate _authGate;
  final HomePreloader _homePreloader;
  final PushRegistrar _pushRegistrar;
  final Duration _preloadMax;

  BootState _state = const BootChecking();
  Future<void>? _starting;
  Timer? _preloadTimer;
  bool _disposed = false;

  BootState get state => _state;

  /// Ready가 되거나 강제 업데이트로 멈출 때 완료한다. 두 번 불러도 한 번만 진행한다.
  Future<void> start() => _starting ??= _start();

  Future<void> _start() async {
    _updateGate.addListener(_onGateChanged);
    await _updateGate.check();
    if (_updateGate.status == UpdateGateStatus.forced) {
      _setState(const BootForceUpdate());
      return;
    }
    await _proceed();
  }

  void _onGateChanged() {
    if (_state is BootForceUpdate &&
        _updateGate.status == UpdateGateStatus.passed) {
      _setState(const BootChecking());
      unawaited(_proceed());
    }
  }

  Future<void> _proceed() async {
    final auth = await _authGate.resolve();
    switch (auth) {
      case SignedOut():
        _setState(const BootReady(BootDestination.login));
      case GuestMode():
        await _preloadHome(guest: true);
      case Authenticated():
        _registerPush();
        await _preloadHome(guest: false);
    }
  }

  void _registerPush() {
    try {
      _pushRegistrar.registerCurrentDevice().catchError((Object _) {});
    } on Object {
      // 푸시 등록 실패는 부팅에 영향을 주지 않는다.
    }
  }

  Future<void> _preloadHome({required bool guest}) async {
    final done = Completer<void>();
    _preloadTimer = Timer(_preloadMax, () {
      if (!done.isCompleted) done.complete();
    });
    unawaited(
      _homePreloader
          .preload(guest: guest)
          .then<void>((_) {}, onError: (Object _) {})
          .whenComplete(() {
            if (!done.isCompleted) done.complete();
          }),
    );
    await done.future;
    _preloadTimer?.cancel();
    _preloadTimer = null;
    _setState(BootReady(BootDestination.home, isGuest: guest));
  }

  void _setState(BootState next) {
    if (_disposed) return;
    _state = next;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _preloadTimer?.cancel();
    _updateGate.removeListener(_onGateChanged);
    super.dispose();
  }
}
