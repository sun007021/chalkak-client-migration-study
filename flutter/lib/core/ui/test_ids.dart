/// docs/testing/testids.md의 식별자. `Semantics(identifier:)`와 `Key`에 같은 값을 쓴다.
abstract final class TestIds {
  static const splashLogo = 'splash.logo';
  static const updateGateDialog = 'update-gate.dialog';
  static const updateGateTitle = 'update-gate.title';
  static const updateGateMessage = 'update-gate.message';
  static const updateGateUpdateButton = 'update-gate.update-button';

  static const loginRoot = 'login.root';
  static const loginTagline = 'login.tagline';
  static const loginKakaoButton = 'login.kakao-button';
  static const loginGuestButton = 'login.guest-button';
  static const loginLoading = 'login.loading';
  static const loginErrorDialog = 'login.error-dialog';
  static const loginErrorDialogConfirmButton =
      'login.error-dialog-confirm-button';

  /// 이 PR에서는 자리표시자 화면의 루트.
  static const termsRoot = 'terms.root';
  static const homeRoot = 'home.root';
}
