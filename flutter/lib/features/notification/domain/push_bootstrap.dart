// 구현 전 껍데기: 본문이 비어 있어 필드가 아직 쓰이지 않는다. 구현하면서 이 줄을 지운다.
// ignore_for_file: unused_field

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

  Future<void> start() => throw UnimplementedError();

  Future<void> dispose() => throw UnimplementedError();
}
