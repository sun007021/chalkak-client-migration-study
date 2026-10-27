import 'dart:async';

import '../core/auth/session_manager.dart';
import '../features/auth/domain/user_data_cleaner.dart';
import 'app_routes.dart';

/// `SessionManager.cleared`를 구독해 로그인 화면으로 보낸다(REQ-AUTH-028).
/// - 어떤 사유든 [goTo]('/login')을 부른다(스택 교체, 뒤로가기 불가).
/// - reauthenticationRequired면 사용자 캐시도 [cleaner].clearAll()로 지운다
///   (userLogout은 해당 유스케이스가 이미 지움).
/// - [dispose] 뒤에는 반응하지 않는다.
class SessionRedirector {
  SessionRedirector({
    required this._sessions,
    required this._cleaner,
    required this._goTo,
  });

  final SessionManager _sessions;
  final UserDataCleaner _cleaner;
  final void Function(String location) _goTo;
  StreamSubscription<SessionClearReason>? _subscription;

  void start() {
    _subscription ??= _sessions.cleared.listen(_onCleared);
  }

  void dispose() {
    _subscription?.cancel();
    _subscription = null;
  }

  Future<void> _onCleared(SessionClearReason reason) async {
    if (reason == SessionClearReason.reauthenticationRequired) {
      try {
        await _cleaner.clearAll();
      } on Object {
        // 캐시 정리에 실패해도 로그인으로 보낸다.
      }
    }
    if (_subscription == null) return;
    _goTo(AppRoutes.login);
  }
}
