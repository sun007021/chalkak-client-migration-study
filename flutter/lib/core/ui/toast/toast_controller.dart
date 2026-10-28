import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../constants/app_constants.dart';

/// 화면 코드가 토스트를 요청하는 창구. ViewModel은 이 인터페이스만 안다.
abstract interface class ToastSink {
  void show(String message);
}

/// 한 번 보여 줄 토스트. 같은 문구라도 [id]가 달라 다시 그려진다(D-20).
class ToastMessage {
  const ToastMessage({required this.id, required this.text});

  final int id;
  final String text;
}

/// 토스트 상태 보관소(D-20, REQ-NAV-044~045, TC-NAV-025~028).
/// - [show]하면 [current]가 새 [ToastMessage]로 바뀌고 [duration] 뒤 사라진다.
/// - 이미 떠 있으면 교체하며 이전 타이머가 새 토스트를 일찍 지우지 않는다.
/// - [screenVisible]이 false인 동안 [show]는 무시하고 쌓지 않으며, false로 바뀌면
///   떠 있던 토스트도 지운다.
class ToastController extends ChangeNotifier implements ToastSink {
  ToastController({this.duration = AppConstants.toastDuration});

  final Duration duration;

  ToastMessage? _current;
  bool _screenVisible = true;
  bool _disposed = false;
  int _sequence = 0;
  Timer? _timer;

  ToastMessage? get current => _current;

  bool get screenVisible => _screenVisible;
  set screenVisible(bool value) {
    if (_screenVisible == value) return;
    _screenVisible = value;
    if (!value) _dismiss();
  }

  @override
  void show(String message) {
    if (_disposed || !_screenVisible) return;
    _timer?.cancel();
    _current = ToastMessage(id: ++_sequence, text: message);
    _timer = Timer(duration, _dismiss);
    notifyListeners();
  }

  void _dismiss() {
    _timer?.cancel();
    _timer = null;
    if (_disposed || _current == null) return;
    _current = null;
    notifyListeners();
  }

  /// 토스트를 그리던 화면이 사라질 때 알림 없이 타이머와 현재 토스트를 정리한다.
  void cancelPending() {
    _timer?.cancel();
    _timer = null;
    _current = null;
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    _timer = null;
    super.dispose();
  }
}
