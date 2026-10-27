import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../core/analytics/analytics_tracker.dart';
import '../../../core/copy/ko.g.dart';
import '../domain/signature_failure.dart';
import '../domain/signature_mode.dart';
import 'signature_draw_view_model.dart' show SignatureMessage;
import 'signature_failure_messages.dart';

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
    required this._submitter,
    required this._analytics,
  }) : _state = SignaturePreviewState(mode: mode, png: png);

  final SignatureSubmitter _submitter;
  final AnalyticsTracker _analytics;
  final StreamController<SignaturePreviewEvent> _events =
      StreamController<SignaturePreviewEvent>.broadcast();
  final CancelToken _cancelToken = CancelToken();

  SignaturePreviewState _state;
  int _errorSequence = 0;
  bool _shown = false;
  bool _disposed = false;

  SignaturePreviewState get state => _state;
  Stream<SignaturePreviewEvent> get events => _events.stream;

  void onShown() {
    if (_shown) return;
    _shown = true;
    _analytics.logEvent(
      AnalyticsEvent.screenView(_state.mode.previewScreenName),
    );
  }

  Future<void> onConfirmPressed() async {
    if (_disposed || _state.isSubmitting) return;
    _set(isSubmitting: true);
    final outcome = await _submitter.submit(_state.png, _cancelToken);
    if (_disposed) return;
    switch (outcome) {
      case SignatureSubmitSucceeded():
        _emit(_completedEvent);
      case SignatureSubmitFailed(:final failure):
        _fail(failure);
      case SignatureSubmitCancelled():
        _set(isSubmitting: false);
    }
  }

  void onRedrawPressed() {
    if (_state.isSubmitting) return;
    _emit(const PreviewRedraw());
  }

  void dismissError() => _set(isSubmitting: _state.isSubmitting);

  SignaturePreviewEvent get _completedEvent => switch (_state.mode) {
    SignatureMode.onboarding => const PreviewSignUpCompleted(),
    SignatureMode.change => const PreviewChangeCompleted(Copy.signChangeDone),
  };

  void _fail(SignatureFailure failure) {
    final message = _messageOf(failure);
    final onboarding = _state.mode == SignatureMode.onboarding;
    switch (failure.kind) {
      case SignatureFailureKind.invalid:
        _set(isSubmitting: false);
        _emit(PreviewReturnToDrawing(message));
      case SignatureFailureKind.expired:
        _set(isSubmitting: false);
        _emit(PreviewReturnToLogin(message));
      case SignatureFailureKind.forbidden when onboarding:
        _set(isSubmitting: false, error: _newMessage(message));
        _emit(PreviewReturnToLogin(message));
      case _:
        _set(isSubmitting: false, error: _newMessage(message));
    }
  }

  String _messageOf(SignatureFailure failure) =>
      _state.mode == SignatureMode.onboarding
      ? SignatureFailureMessages.signUp(failure)
      : SignatureFailureMessages.change(failure);

  SignatureMessage _newMessage(String text) =>
      SignatureMessage(id: ++_errorSequence, text: text);

  void _emit(SignaturePreviewEvent event) {
    if (!_disposed) _events.add(event);
  }

  /// 두 값을 항상 함께 정한다(오류를 남기려면 [_state]의 값을 그대로 넘긴다).
  void _set({required bool isSubmitting, SignatureMessage? error}) {
    if (_disposed) return;
    _state = SignaturePreviewState(
      mode: _state.mode,
      png: _state.png,
      isSubmitting: isSubmitting,
      error: error,
    );
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
