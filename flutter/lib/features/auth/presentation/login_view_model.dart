import 'dart:async';

import 'package:flutter/foundation.dart';

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
  LoginViewModel({
    required LoginUseCase loginUseCase,
    required EnterGuestUseCase enterGuest,
  });

  LoginState get state => throw UnimplementedError();
  Stream<LoginEvent> get events => throw UnimplementedError();

  Future<void> onKakaoPressed() => throw UnimplementedError();
  Future<void> onGuestPressed() => throw UnimplementedError();

  /// 오류 알림의 확인 버튼.
  void dismissError() => throw UnimplementedError();

  /// 화면 전환이 끝난 뒤 다시 제출할 수 있게 한다.
  void resetSubmission() => throw UnimplementedError();
}
