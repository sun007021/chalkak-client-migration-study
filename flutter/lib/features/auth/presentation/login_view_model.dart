import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../core/copy/ko.g.dart';

import '../domain/login_failure.dart';
import '../domain/login_use_case.dart';
import '../domain/session_use_cases.dart';
import '../domain/signup_credentials.dart';

/// 화면에 한 번 보여 줄 로그인 오류. 같은 문구가 연달아도 [id]가 달라 다시 표시된다.
class LoginError {
  const LoginError({required this.id, required this.message});
  final int id;
  final String message;
}

class LoginState {
  const LoginState({this.isSubmitting = false, this.error});

  /// true인 동안 두 버튼 비활성, 진행 표시.
  final bool isSubmitting;
  final LoginError? error;
}

sealed class LoginEvent {
  const LoginEvent();
}

final class NavigateToMain extends LoginEvent {
  const NavigateToMain();
}

final class NavigateToTerms extends LoginEvent {
  const NavigateToTerms(this.credentials);
  final SignUpCredentials credentials;
}

/// 로그인 화면 상태(REQ-AUTH-007, 010, 013~020).
/// - 진행 중 [onKakaoPressed]/[onGuestPressed]는 무시(SDK·서버 호출 1회).
/// - 성공·가입 필요 이벤트를 낸 뒤에도 [resetSubmission] 전까지 isSubmitting을 유지한다
///   (화면 전환 중 재제출 방지).
/// - 실패는 isSubmitting=false + [LoginState.error](문구는 Copy.*, forbidden은 서버 message),
///   취소는 오류 없이 isSubmitting=false.
/// - [dispose]하면 진행 중 요청을 취소하고 이후 상태·이벤트를 내지 않는다.
class LoginViewModel extends ChangeNotifier {
  LoginViewModel({required this._loginUseCase, required this._enterGuest});

  final LoginUseCase _loginUseCase;
  final EnterGuestUseCase _enterGuest;
  final StreamController<LoginEvent> _events =
      StreamController<LoginEvent>.broadcast();
  final CancelToken _cancelToken = CancelToken();

  LoginState _state = const LoginState();
  int _errorSequence = 0;
  bool _disposed = false;

  LoginState get state => _state;
  Stream<LoginEvent> get events => _events.stream;

  Future<void> onKakaoPressed() async {
    if (!_beginSubmission()) return;
    final outcome = await _loginUseCase.loginWithKakao(
      cancelToken: _cancelToken,
    );
    if (_disposed) return;
    switch (outcome) {
      case LoginSucceeded():
        _emit(const NavigateToMain());
      case LoginSignUpRequired(:final credentials):
        _emit(NavigateToTerms(credentials));
      case LoginCancelled():
        _setState(const LoginState());
      case LoginFailed(:final failure):
        _fail(_messageOf(failure));
    }
  }

  Future<void> onGuestPressed() async {
    if (!_beginSubmission()) return;
    final saved = await _enterGuest();
    if (_disposed) return;
    if (saved) {
      _emit(const NavigateToMain());
    } else {
      _fail(Copy.authLoginErrorGuest);
    }
  }

  /// 오류 알림의 확인 버튼.
  void dismissError() =>
      _setState(LoginState(isSubmitting: _state.isSubmitting));

  /// 다른 화면(가입 등)에서 돌아오며 넘긴 안내 문구를 오류 알림으로 보여 준다.
  void showNotice(String message) => _fail(message);

  /// 화면 전환이 끝난 뒤 다시 제출할 수 있게 한다.
  void resetSubmission() => _setState(const LoginState());

  bool _beginSubmission() {
    if (_disposed || _state.isSubmitting) return false;
    _setState(const LoginState(isSubmitting: true));
    return true;
  }

  /// 성공·가입 필요는 화면 전환이 끝날 때까지 isSubmitting을 유지한다.
  void _emit(LoginEvent event) => _events.add(event);

  void _fail(String message) {
    _setState(
      LoginState(
        error: LoginError(id: ++_errorSequence, message: message),
      ),
    );
  }

  static String _messageOf(LoginFailure failure) => switch (failure.kind) {
    LoginFailureKind.config => Copy.authLoginErrorConfig,
    LoginFailureKind.kakaoFailed => Copy.authLoginErrorKakaoFailed,
    LoginFailureKind.kakaoAccount => Copy.authLoginErrorKakaoAccount,
    LoginFailureKind.network => Copy.authLoginErrorNetwork,
    LoginFailureKind.invalidResponse => Copy.authLoginErrorInvalidResponse,
    LoginFailureKind.forbidden =>
      failure.serverMessage ?? Copy.authLoginErrorGeneric,
    LoginFailureKind.generic => Copy.authLoginErrorGeneric,
  };

  void _setState(LoginState next) {
    if (_disposed) return;
    _state = next;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _cancelToken.cancel();
    _events.close();
    super.dispose();
  }
}
