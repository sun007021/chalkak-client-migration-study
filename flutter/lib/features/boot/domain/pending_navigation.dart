import '../../auth/domain/user_data_cleaner.dart';
import 'update_gate.dart';

/// 푸시 탭 같은 외부 이동 요청을 게이트가 풀릴 때까지 보류한다(D-11, D-15).
/// - 게이트가 통과 상태면 [request]는 바로 [navigate]를 부른다.
/// - checking/forced면 마지막 요청 하나만 보류했다가 통과되는 순간 한 번 처리한다.
/// - [clearAll](로그아웃·계정 전환)은 보류 중인 이동을 버린다.
class PendingNavigation implements UserDataCleaner {
  PendingNavigation({
    required UpdateGate gate,
    required void Function(String location) navigate,
  });

  bool get hasPending => throw UnimplementedError();

  void request(String location) => throw UnimplementedError();

  void discard() => throw UnimplementedError();

  void dispose() => throw UnimplementedError();

  @override
  Future<void> clearAll() => throw UnimplementedError();
}
