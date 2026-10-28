import 'dart:async';

import 'package:clock/clock.dart';

import '../../../core/constants/app_constants.dart';

/// 폴링 창과 다음 조회 예약(REQ-AIR-025~027). 시간은 `package:clock`과 [Timer]로만 다룬다.
///
/// - [open]이 창 시작 시각을 정한다(이미 열려 있으면 그대로, `restart`면 지금으로 다시).
/// - [schedule]은 직전 응답 [interval] 뒤에 [onTick]을 예약한다. 남은 창이 [interval]보다 짧으면
///   창 끝에 맞춘다. 경과가 [window] 이상이면(정확히 300.000초 포함) [onTick] 없이 창을 닫고
///   [onTimeout]을 부른다. 창이 열려 있지 않으면 아무 것도 하지 않는다.
/// - 예약은 하나뿐이라 요청이 겹치지 않는다(다음 [schedule]은 응답 뒤에 호출한다).
class AiPoller {
  AiPoller({
    required this.onTick,
    required this.onTimeout,
    this.interval = AppConstants.aiReviewPollInterval,
    this.window = AppConstants.aiReviewPollWindow,
  });

  final void Function() onTick;
  final void Function() onTimeout;
  final Duration interval;
  final Duration window;

  DateTime? _start;
  Timer? _timer;

  bool get isOpen => _start != null;

  void open({bool restart = false}) {
    if (restart || _start == null) _start = clock.now();
  }

  void schedule() {
    _timer?.cancel();
    _timer = null;
    final start = _start;
    if (start == null) return;
    final remaining = window - clock.now().difference(start);
    if (remaining <= Duration.zero) {
      _timeout();
      return;
    }
    _timer = Timer(remaining < interval ? remaining : interval, _fire);
  }

  void _fire() {
    _timer = null;
    final start = _start;
    if (start == null) return;
    if (clock.now().difference(start) >= window) {
      _timeout();
      return;
    }
    onTick();
  }

  void _timeout() {
    stop();
    onTimeout();
  }

  /// 예약만 취소한다(창은 유지).
  void pause() {
    _timer?.cancel();
    _timer = null;
  }

  /// 예약을 취소하고 창을 닫는다.
  void stop() {
    pause();
    _start = null;
  }
}
