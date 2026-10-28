import '../../../core/push/push_payload.dart';

/// 보류 중인 푸시 탭 하나. 탭한 시점의 계정 [userId]를 함께 둔다(계정 전환 시 폐기, TC-PUSH-066).
class PendingPush {
  const PendingPush({required this.payload, required this.userId});

  final PushPayload payload;
  final String userId;
}

/// 프로세스가 죽어도 남는 보류 저장소(TC-PUSH-063). 하나만 저장하고 새 탭은 이전 보류분을 교체한다.
/// 실제 구현(SharedPreferences나 보안 저장소)은 구현 PR이 만든다.
abstract interface class PendingPushStore {
  Future<PendingPush?> read();
  Future<void> write(PendingPush pending);
  Future<void> clear();
}
