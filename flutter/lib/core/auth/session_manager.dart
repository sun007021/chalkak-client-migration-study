import 'session.dart';
import 'token_store.dart';

enum SessionClearReason { reauthenticationRequired, userLogout }

/// 세션 읽기·저장·지움의 단일 창구. 지움은 [cleared] 스트림으로 알려
/// 앱이 로그인 화면으로 보내게 한다.
class SessionManager {
  SessionManager({required TokenStore store});

  Stream<SessionClearReason> get cleared => throw UnimplementedError();

  Future<Session?> read() => throw UnimplementedError();
  Future<void> save(Session session) => throw UnimplementedError();

  /// 저장소를 비우고 [cleared]에 사유를 한 번 낸다.
  Future<void> clear(SessionClearReason reason) => throw UnimplementedError();

  /// 현재 저장된 세션의 refreshToken이 [previous]와 같을 때만 [next]를 저장하고
  /// true. 그 사이 로그아웃·계정 전환이 있었으면 저장하지 않고 false.
  Future<bool> saveRefreshed({
    required Session previous,
    required Session next,
  }) => throw UnimplementedError();
}
