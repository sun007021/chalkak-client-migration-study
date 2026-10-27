import 'package:dio/dio.dart';

import '../../../core/auth/session.dart';
import '../../../core/auth/session_manager.dart';
import '../../../core/network/api_error.dart';
import 'auth_repository.dart';
import 'login_failure.dart';
import 'nonce.dart';
import 'push_registrar.dart';
import 'signup_credentials.dart';
import 'social_login_client.dart';
import 'user_data_cleaner.dart';

sealed class LoginOutcome {
  const LoginOutcome();
}

final class LoginSucceeded extends LoginOutcome {
  const LoginSucceeded(this.session);
  final Session session;
}

final class LoginSignUpRequired extends LoginOutcome {
  const LoginSignUpRequired(this.credentials);
  final SignUpCredentials credentials;
}

/// 사용자 취소 또는 [CancelToken] 취소. 오류 문구 없이 초기 상태로 돌아간다.
final class LoginCancelled extends LoginOutcome {
  const LoginCancelled();
}

final class LoginFailed extends LoginOutcome {
  const LoginFailed(this.failure);
  final LoginFailure failure;
}

/// 카카오 로그인 한 번(REQ-AUTH-002~015, 034).
/// 1. [nonceGenerator]로 새 rawNonce, SDK에는 `Nonce.sha256Hex(rawNonce)`, 서버에는 rawNonce 원문.
/// 2. SDK 예외를 취소/설정 오류(MissingIdToken)/일반 실패로 나누고 실패하면 서버를 부르지 않는다.
/// 3. LOGIN_SUCCESS: 이전 세션이 있고 userId가 다르면 [cleaner].clearAll() 후 새 세션 저장
///    (게스트 플래그는 저장 값에 없음), 푸시 등록 시작(실패·지연 무시, 기다리지 않음).
///    저장 직전에 [cancelToken]이 취소됐으면 저장하지 않고 [LoginCancelled].
/// 4. SIGN_UP_REQUIRED: 토큰을 저장하지 않고 idToken·rawNonce를 담아 돌려준다.
/// 5. ApiError.cancelled는 [LoginCancelled], 나머지는 [LoginFailure.fromApiError].
class LoginUseCase {
  LoginUseCase({
    required this._socialLogin,
    required this._nonceGenerator,
    required this._repository,
    required this._sessions,
    required this._cleaner,
    required this._pushRegistrar,
  });

  final SocialLoginClient _socialLogin;
  final NonceGenerator _nonceGenerator;
  final AuthRepository _repository;
  final SessionManager _sessions;
  final UserDataCleaner _cleaner;
  final PushRegistrar _pushRegistrar;

  Future<LoginOutcome> loginWithKakao({CancelToken? cancelToken}) async {
    final rawNonce = _nonceGenerator.generate();
    final String idToken;
    try {
      idToken = await _socialLogin.requestIdToken(
        nonce: Nonce.sha256Hex(rawNonce),
      );
    } on SocialLoginCancelledException {
      return const LoginCancelled();
    } on SocialLoginMissingIdTokenException {
      return const LoginFailed(LoginFailure(LoginFailureKind.config));
    } on Object {
      return const LoginFailed(LoginFailure(LoginFailureKind.kakaoFailed));
    }

    final SocialLoginResponse response;
    try {
      response = await _repository.socialLogin(
        idToken: idToken,
        rawNonce: rawNonce,
        cancelToken: cancelToken,
      );
    } on ApiError catch (e) {
      if (e.isCancelled) return const LoginCancelled();
      return LoginFailed(LoginFailure.fromApiError(e));
    }

    switch (response) {
      case SocialLoginSignUpRequired():
        return LoginSignUpRequired(
          SignUpCredentials(idToken: idToken, rawNonce: rawNonce),
        );
      case SocialLoginSucceeded(:final session):
        if (cancelToken?.isCancelled ?? false) return const LoginCancelled();
        try {
          await _replaceSession(session);
        } on Object {
          // 저장소를 읽거나 쓰지 못하면 로그인 실패로 알린다(진행 표시가 남지 않게).
          return const LoginFailed(LoginFailure(LoginFailureKind.generic));
        }
        _pushRegistrar.startRegistration();
        return LoginSucceeded(session);
    }
  }

  /// 이전 세션이 다른 회원이거나 읽을 수 없으면 사용자 캐시를 먼저 지우고 저장한다.
  Future<void> _replaceSession(Session session) async {
    Session? previous;
    var unreadable = false;
    try {
      previous = await _sessions.read();
    } on Object {
      unreadable = true;
    }
    if (unreadable ||
        (previous != null &&
            !previous.isGuest &&
            previous.userId != session.userId)) {
      await _cleaner.clearAll();
    }
    await _sessions.save(session);
  }
}
