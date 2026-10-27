import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/analytics/analytics_tracker.dart';
import '../domain/signature_failure.dart';
import '../domain/signature_mode.dart';
import 'signature_draw_view_model.dart' show SignatureMessage;

class SignaturePreviewState {
  const SignaturePreviewState({
    required this.mode,
    required this.png,
    this.isSubmitting = false,
    this.error,
  });

  final SignatureMode mode;
  final Uint8List png;

  /// 요청이 끝날 때까지(PENDING 재시도 대기 포함) true. 성공 이벤트 뒤에도 true로 둔다.
  final bool isSubmitting;
  final SignatureMessage? error;
}

sealed class SignaturePreviewEvent {
  const SignaturePreviewEvent();
}

/// "다시 그리기". 서버 호출 없음. 그리기 화면으로 돌아가 새로 그린다(REQ-SIGN-011).
final class PreviewRedraw extends SignaturePreviewEvent {
  const PreviewRedraw();
}

/// 가입 완료. 가입 화면을 백스택에서 제거하고 메인으로 간다(REQ-ONB-019).
final class PreviewSignUpCompleted extends SignaturePreviewEvent {
  const PreviewSignUpCompleted();
}

/// 사인 변경 성공. 설정으로 돌아가 [toastMessage]를 띄우고 사인 카드를 다시 불러온다.
final class PreviewChangeCompleted extends SignaturePreviewEvent {
  const PreviewChangeCompleted(this.toastMessage);
  final String toastMessage;
}

/// 서버가 사인을 거절했다(invalid). 그리기 화면으로 돌아가 [message]를 보여 준다.
final class PreviewReturnToDrawing extends SignaturePreviewEvent {
  const PreviewReturnToDrawing(this.message);
  final String message;
}

/// 로그인 화면으로 돌아가 [message]를 보여 준다. expired(가입·변경)와 가입의 forbidden.
final class PreviewReturnToLogin extends SignaturePreviewEvent {
  const PreviewReturnToLogin(this.message);
  final String message;
}

/// 사인 미리보기 상태(REQ-ONB-012, 017, 020, REQ-SIGN-018~028).
/// - [onConfirmPressed]: 진행 중이면 무시(연타해도 [SignatureSubmitter.submit] 1회). 시작하면
///   isSubmitting=true, 오류 지움.
/// - 결과: 성공 -> 모드별 완료 이벤트(변경은 `Copy.signChangeDone` 토스트), isSubmitting 유지.
///   실패 -> isSubmitting=false + error(가입은 [SignatureFailureMessages.signUp] (signature_failure_messages.dart), 변경은
///   `.change`). invalid는 [PreviewReturnToDrawing], expired는 [PreviewReturnToLogin],
///   가입의 forbidden은 error + [PreviewReturnToLogin]. 그 밖의 실패는 미리보기에 머물고
///   png는 그대로라 다시 누르면 처음부터 다시 시작한다.
///   취소 결과는 상태·이벤트 없이 버린다.
/// - [dispose]: 진행 중 요청의 CancelToken을 취소하고 이후 상태·이벤트를 내지 않는다.
/// - [onShown]: `screen_view`(모드별 preview 화면 이름)를 인스턴스당 한 번만 보낸다.
class SignaturePreviewViewModel extends ChangeNotifier {
  SignaturePreviewViewModel({
    required SignatureMode mode,
    required Uint8List png,
    required SignatureSubmitter submitter,
    required AnalyticsTracker analytics,
  });

  SignaturePreviewState get state => throw UnimplementedError();
  Stream<SignaturePreviewEvent> get events => throw UnimplementedError();

  void onShown() => throw UnimplementedError();
  Future<void> onConfirmPressed() => throw UnimplementedError();
  void onRedrawPressed() => throw UnimplementedError();
  void dismissError() => throw UnimplementedError();
}
