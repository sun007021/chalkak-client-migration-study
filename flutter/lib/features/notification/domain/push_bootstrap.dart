import 'dart:async';

import '../../../core/push/push_message_source.dart';
import '../../../core/push/push_token_provider.dart';
import 'push_device_registrar.dart';
import 'push_foreground_handler.dart';
import 'push_tap_coordinator.dart';

/// 푸시 SDK 스트림을 도메인 객체에 잇는다(REQ-PUSH-032, TC-PUSH-015, 062).
/// - [start]: `foreground` -> [PushForegroundHandler.handle], `opened` -> [PushTapCoordinator.onTapped],
///   `initialMessage()`(콜드 스타트) -> 있으면 [PushTapCoordinator.onTapped] 1회,
///   `tokenRefreshed` -> [PushDeviceRegistrar.onTokenRefreshed].
/// - 한 스트림의 처리 실패(예외)가 다른 스트림 구독을 끊지 않는다.
/// - [dispose]는 구독을 모두 취소한다. [start]를 두 번 불러도 구독은 한 벌이다.
class PushBootstrap {
  PushBootstrap({
    required this._messages,
    required this._tokens,
    required this._registrar,
    required this._coordinator,
    required this._foreground,
  });

  final PushMessageSource _messages;
  final PushTokenProvider _tokens;
  final PushDeviceRegistrar _registrar;
  final PushTapCoordinator _coordinator;
  final PushForegroundHandler _foreground;

  final List<StreamSubscription<void>> _subscriptions = [];
  bool _started = false;
  bool _disposed = false;

  Future<void> start() async {
    if (_started || _disposed) return;
    _started = true;
    _subscriptions
      ..add(_listen<PushMessage>(_messages.foreground, _foreground.handle))
      ..add(
        _listen<PushMessage>(
          _messages.opened,
          (m) => _coordinator.onTapped(m.payload),
        ),
      )
      ..add(
        _listen<String>(_tokens.tokenRefreshed, _registrar.onTokenRefreshed),
      );

    // 콜드 스타트: 종료 상태에서 알림을 눌러 시작된 경우 1회만 읽힌다.
    try {
      final initial = await _messages.initialMessage();
      if (initial != null && !_disposed) {
        await _coordinator.onTapped(initial.payload);
      }
    } on Object {
      // 시작 메시지를 읽지 못해도 다른 스트림은 계속 동작한다.
    }
  }

  /// 한 이벤트의 처리 실패가 구독을 끊지 않게 감싼다.
  StreamSubscription<T> _listen<T>(
    Stream<T> stream,
    Future<Object?> Function(T event) handle,
  ) {
    return stream.listen((event) async {
      if (_disposed) return;
      try {
        await handle(event);
      } on Object {
        // 처리 실패는 삼키고 다음 이벤트를 받는다.
      }
    }, onError: (Object _) {});
  }

  Future<void> dispose() async {
    _disposed = true;
    final subscriptions = List.of(_subscriptions);
    _subscriptions.clear();
    for (final subscription in subscriptions) {
      // 취소 완료를 기다리지 않는다. 구독은 취소 요청 즉시 이벤트를 받지 않는다.
      unawaited(subscription.cancel().catchError((Object _) {}));
    }
  }
}
