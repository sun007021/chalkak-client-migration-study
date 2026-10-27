import 'package:clock/clock.dart';

import '../../../core/auth/session.dart';
import '../../../core/auth/session_manager.dart';

/// 저장된 세션으로 정한 시작 상태(REQ-BOOT-015).
sealed class AuthGateResult {
  const AuthGateResult();
}

final class SignedOut extends AuthGateResult {
  const SignedOut();
}

final class GuestMode extends AuthGateResult {
  const GuestMode();
}

final class Authenticated extends AuthGateResult {
  const Authenticated(this.session);
  final Session session;
}

/// 인증 게이트(REQ-BOOT-015~020).
/// - userId가 있고 refresh token이 만료 전이면 게스트 플래그와 무관하게 [Authenticated].
///   이때 저장소에 isGuest=true가 남아 있으면 isGuest=false로 고쳐 저장한다(ApiClient가
///   isGuest 세션을 게스트로 취급해 토큰을 붙이지 않기 때문).
/// - access token 만료만으로는 로그아웃하지 않는다.
/// - refresh 만료(now 이하)·불완전 세션은 저장소를 비우고 [SignedOut].
/// - 게스트 플래그만 있으면 [GuestMode], 아무것도 없으면 [SignedOut].
/// - 읽기 실패(손상, 복호화 실패)도 크래시 없이 [SignedOut].
class AuthGate {
  AuthGate({required this._sessions});

  final SessionManager _sessions;

  Future<AuthGateResult> resolve() async {
    final Session? session;
    try {
      session = await _sessions.read();
    } on Object {
      await _clearQuietly();
      return const SignedOut();
    }
    if (session == null) return const SignedOut();

    final hasCredentials =
        session.userId.isNotEmpty && session.refreshToken.isNotEmpty;
    if (hasCredentials) {
      if (session.isRefreshExpired(clock.now())) {
        await _clearQuietly();
        return const SignedOut();
      }
      if (session.isGuest) return Authenticated(await _asMember(session));
      return Authenticated(session);
    }
    if (session.isGuest) return const GuestMode();
    await _clearQuietly();
    return const SignedOut();
  }

  /// ApiClient는 isGuest 세션에 토큰을 붙이지 않으므로 회원 세션으로 고쳐 저장한다.
  Future<Session> _asMember(Session guestFlagged) async {
    final member = Session(
      userId: guestFlagged.userId,
      accessToken: guestFlagged.accessToken,
      accessTokenExpiresAt: guestFlagged.accessTokenExpiresAt,
      refreshToken: guestFlagged.refreshToken,
      refreshTokenExpiresAt: guestFlagged.refreshTokenExpiresAt,
    );
    await _sessions.save(member);
    return member;
  }

  Future<void> _clearQuietly() async {
    try {
      await _sessions.clear(SessionClearReason.reauthenticationRequired);
    } on Object {
      // 정리에 실패해도 로그인 화면으로 간다.
    }
  }
}
