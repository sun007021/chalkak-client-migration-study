import '../core/auth/session_manager.dart';
import '../features/auth/domain/user_data_cleaner.dart';

/// `SessionManager.cleared`를 구독해 로그인 화면으로 보낸다(REQ-AUTH-028).
/// - 어떤 사유든 [goTo]('/login')을 부른다(스택 교체, 뒤로가기 불가).
/// - reauthenticationRequired면 사용자 캐시도 [cleaner].clearAll()로 지운다
///   (userLogout은 해당 유스케이스가 이미 지움).
/// - [dispose] 뒤에는 반응하지 않는다.
class SessionRedirector {
  SessionRedirector({
    required SessionManager sessions,
    required UserDataCleaner cleaner,
    required void Function(String location) goTo,
  });

  void start() => throw UnimplementedError();

  void dispose() => throw UnimplementedError();
}
