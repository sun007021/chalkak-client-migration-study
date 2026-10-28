import 'push_payload.dart';

/// 수신한 푸시 한 건. [title]·[body]는 표시용이며 이동 분기에 쓰지 않는다(TC-PUSH-051).
class PushMessage {
  const PushMessage({required this.payload, this.title, this.body});

  final PushPayload payload;
  final String? title;
  final String? body;
}

/// 푸시 SDK(firebase_messaging) 뒤의 수신 창구. 실제 구현은 SDK 패키지를 붙이는 구현 PR에서 만든다.
abstract interface class PushMessageSource {
  /// 앱이 포그라운드일 때 도착한 푸시.
  Stream<PushMessage> get foreground;

  /// 백그라운드 상태에서 알림을 눌러 앱이 돌아온 경우.
  Stream<PushMessage> get opened;

  /// 종료 상태에서 알림을 눌러 앱이 시작된 경우(없으면 null). 한 번 읽으면 소비된다.
  Future<PushMessage?> initialMessage();
}
