import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/analytics/analytics_tracker.dart';
import '../domain/signature_drawing.dart';
import '../domain/signature_mode.dart';
import '../domain/signature_renderer.dart';

/// 화면에 한 번 보여 줄 오류. 같은 문구가 연달아도 [id]가 달라 다시 표시된다.
class SignatureMessage {
  const SignatureMessage({required this.id, required this.text});
  final int id;
  final String text;
}

class SignatureDrawState {
  const SignatureDrawState({
    required this.drawing,
    this.isRendering = false,
    this.error,
  });

  final SignatureDrawing drawing;

  /// PNG를 만드는 중. 이 동안 확정 버튼은 비활성이다.
  final bool isRendering;

  /// `sign.error.too-large` 등 로컬 검증 오류. 다음 그리기·지우기 동작에 사라진다.
  final SignatureMessage? error;

  /// 획이 하나도 없으면 되돌리기·전체 지우기·확정이 모두 비활성(REQ-SIGN-003).
  bool get canUndo => throw UnimplementedError();
  bool get canClear => throw UnimplementedError();
  bool get canConfirm => throw UnimplementedError();
}

sealed class SignatureDrawEvent {
  const SignatureDrawEvent();
}

/// 렌더링한 PNG(1 MiB 이하)를 들고 미리보기로 간다.
final class NavigateToPreview extends SignatureDrawEvent {
  const NavigateToPreview(this.png);
  final Uint8List png;
}

/// 뒤로 가기. 가입은 약관, 변경은 설정으로 돌아간다.
final class NavigateBackFromDrawing extends SignatureDrawEvent {
  const NavigateBackFromDrawing();
}

/// 사인 그리기 상태(REQ-SIGN-001~009, TC-SIGN-001~008, 014, 015).
/// - [onStrokeStart]/[onStrokeUpdate]: [SignatureDrawing]에 위임(좌표 보정 포함).
///   획의 끝([onStrokeEnd])은 상태를 바꾸지 않는다.
/// - [onConfirmPressed]: 획이 없거나 렌더링 중이면 무시. 렌더러가 만든 PNG가 1 MiB 이하이면
///   [NavigateToPreview]를 한 번만 낸다(연타해도 한 번, 이벤트 후에는 [reset] 전까지 무시).
///   1 MiB 초과면 `Copy.signErrorTooLarge` 오류를 내고 그림은 유지, 이벤트 없음.
///   렌더러가 던지면 오류 문구(가입 `Copy.onbSignupErrorGeneric`, 변경 `Copy.signChangeErrorGeneric`)를
///   [SignatureDrawState.error]에 내고 그림은 유지한다.
/// - [reset]: 미리보기에서 돌아와 다시 확정할 수 있게 한다(그림은 유지).
/// - [clear]는 그림을 지운다("다시 그리기"는 이전 획을 지운 상태로 시작, REQ-SIGN-011).
/// - [onShown]: `screen_view`(모드별 draw 화면 이름)를 인스턴스당 한 번만 보낸다.
class SignatureDrawViewModel extends ChangeNotifier {
  SignatureDrawViewModel({
    required SignatureMode mode,
    required SignatureRenderer renderer,
    required AnalyticsTracker analytics,
    required double canvasWidth,
    required double canvasHeight,
  });

  SignatureMode get mode => throw UnimplementedError();
  SignatureDrawState get state => throw UnimplementedError();
  Stream<SignatureDrawEvent> get events => throw UnimplementedError();

  void onShown() => throw UnimplementedError();

  /// 그리기 영역의 실제 크기가 정해지거나 바뀌면 좌표 보정 영역을 갱신한다(획은 유지).
  void onCanvasSizeChanged(double width, double height) =>
      throw UnimplementedError();

  void onStrokeStart(double x, double y) => throw UnimplementedError();
  void onStrokeUpdate(double x, double y) => throw UnimplementedError();
  void onStrokeEnd() => throw UnimplementedError();
  void undo() => throw UnimplementedError();
  void clear() => throw UnimplementedError();
  Future<void> onConfirmPressed() => throw UnimplementedError();
  void onBackPressed() => throw UnimplementedError();

  /// 서버가 사인을 거절해 돌아왔을 때(`sign.error.invalid` 등) 그리기 화면에 띄울 문구.
  void showError(String text) => throw UnimplementedError();

  void reset() => throw UnimplementedError();
}
