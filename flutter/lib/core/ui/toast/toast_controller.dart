// ignore_for_file: unused_field
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

  ToastMessage? get current => throw UnimplementedError();

  bool get screenVisible => throw UnimplementedError();
  set screenVisible(bool value) => throw UnimplementedError();

  @override
  void show(String message) => throw UnimplementedError();

  @override
  void dispose() {
    super.dispose();
    throw UnimplementedError();
  }
}
