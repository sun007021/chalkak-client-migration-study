import '../../../core/auth/session.dart';
import '../../../core/auth/session_manager.dart';
import '../../../core/network/api_error.dart';
import 'auth_repository.dart';
import 'user_data_cleaner.dart';

/// 게스트 진입(REQ-AUTH-019~020). 서버를 부르지 않고 저장된 자격 증명을 지운 뒤
/// 게스트 세션(`Session.guest()`)을 저장한다. 저장이 실패하면 false.
class EnterGuestUseCase {
  EnterGuestUseCase({required this._sessions});

  final SessionManager _sessions;

  Future<bool> call() async {
    try {
      await _sessions.save(Session.guest());
      return true;
    } on Object {
      return false;
    }
  }
}

/// 설정의 게스트 "로그인" 버튼(D-05, TC-AUTH-033). 게스트 플래그를 지운다
/// (`SessionManager.clear(userLogout)` -> cleared 이벤트로 로그인 화면 이동).
class LeaveGuestUseCase {
  LeaveGuestUseCase({required this._sessions});

  final SessionManager _sessions;

  Future<void> call() => _sessions.clear(SessionClearReason.userLogout);
}

/// 로그아웃(D-16, REQ-AUTH-033~036, 040).
/// 순서: 세션 읽기 -> [UserDataCleaner.clearAll] + 세션 지움(userLogout) -> refresh token이
/// 있으면 `POST /auth/logout`(실패·401 무시, 재시도 없음). 게스트·토큰 없음이면 서버 호출 없음.
/// 진행 중에 다시 불리면 새 작업을 만들지 않는다.
class LogoutUseCase {
  LogoutUseCase({
    required this._sessions,
    required this._repository,
    required this._cleaner,
  });

  final SessionManager _sessions;
  final AuthRepository _repository;
  final UserDataCleaner _cleaner;
  Future<void>? _running;

  Future<void> call() =>
      _running ??= _run().whenComplete(() => _running = null);

  Future<void> _run() async {
    final session = await _sessions.read();
    await _cleaner.clearAll();
    await _sessions.clear(SessionClearReason.userLogout);
    final refreshToken = session?.refreshToken ?? '';
    if (session == null || session.isGuest || refreshToken.isEmpty) return;
    try {
      await _repository.logout(refreshToken: refreshToken);
    } on Object {
      // 서버 로그아웃 실패는 이미 끝난 로컬 로그아웃에 영향을 주지 않는다.
    }
  }
}

enum WithdrawResult { succeeded, failed, cancelled }

/// 회원탈퇴(D-16, REQ-AUTH-038~041, 048~049).
/// `DELETE /users/me`가 성공(204)할 때만 [UserDataCleaner.clearAll] + 세션 지움.
/// ApiError.cancelled는 [WithdrawResult.cancelled](세션 유지, 오류 아님), 그 밖의 오류는
/// [WithdrawResult.failed](세션 유지). 진행 중 재호출은 서버 요청을 늘리지 않는다.
/// 화면이 사라져도 요청은 취소하지 않으므로 204가 오면 정리는 끝까지 한다.
class WithdrawUseCase {
  WithdrawUseCase({
    required this._sessions,
    required this._repository,
    required this._cleaner,
  });

  final SessionManager _sessions;
  final AuthRepository _repository;
  final UserDataCleaner _cleaner;
  Future<WithdrawResult>? _running;

  Future<WithdrawResult> call() =>
      _running ??= _run().whenComplete(() => _running = null);

  Future<WithdrawResult> _run() async {
    try {
      await _repository.deleteAccount();
    } on ApiError catch (e) {
      return e.isCancelled ? WithdrawResult.cancelled : WithdrawResult.failed;
    } on Object {
      return WithdrawResult.failed;
    }
    await _cleaner.clearAll();
    await _sessions.clear(SessionClearReason.userLogout);
    return WithdrawResult.succeeded;
  }
}
