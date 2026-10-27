import '../../../core/analytics/analytics_constants.dart';

/// 같은 그리기·미리보기 화면을 가입과 설정의 사인 변경이 함께 쓴다.
enum SignatureMode {
  onboarding,
  change;

  /// 그리기 화면의 screen_view 이름: onboarding_signature / change_signature.
  String get drawScreenName => switch (this) {
    SignatureMode.onboarding => ScreenNames.onboardingSignature,
    SignatureMode.change => ScreenNames.changeSignature,
  };

  /// 미리보기 화면의 screen_view 이름: onboarding_signature_preview / change_signature_preview.
  String get previewScreenName => switch (this) {
    SignatureMode.onboarding => ScreenNames.onboardingSignaturePreview,
    SignatureMode.change => ScreenNames.changeSignaturePreview,
  };
}
