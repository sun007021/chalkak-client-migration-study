/// 이벤트 이름·파라미터 키·허용 screen_name(D-22).
/// 철자는 shared/constants.json과 test/core/constants/shared_constants_test.dart가 대조한다.
abstract final class AnalyticsNames {
  static const screenViewEvent = 'screen_view';
  static const bottomNavigationSelectedEvent = 'bottom_navigation_selected';
  static const screenNameParam = 'screen_name';
  static const screenClassParam = 'screen_class';
  static const destinationParam = 'destination';
}

abstract final class ScreenNames {
  static const login = 'login';
  static const terms = 'terms';
  static const termsOfService = 'terms_of_service';
  static const privacyPolicy = 'privacy_policy';
  static const onboardingSignature = 'onboarding_signature';
  static const onboardingSignaturePreview = 'onboarding_signature_preview';
  static const changeSignature = 'change_signature';
  static const changeSignaturePreview = 'change_signature_preview';
  static const home = 'home';
  static const issue = 'issue';
  static const notifications = 'notifications';
  static const notificationDetail = 'notification_detail';
  static const display = 'display';
  static const feed = 'feed';
  static const record = 'record';
  static const settings = 'settings';
  static const feedback = 'feedback';
  static const photoUpload = 'photo_upload';
  static const photoUploadSuccess = 'photo_upload_success';

  /// 허용 목록 19종.
  static const all = <String>[
    login,
    terms,
    termsOfService,
    privacyPolicy,
    onboardingSignature,
    onboardingSignaturePreview,
    changeSignature,
    changeSignaturePreview,
    home,
    issue,
    notifications,
    notificationDetail,
    display,
    feed,
    record,
    settings,
    feedback,
    photoUpload,
    photoUploadSuccess,
  ];
}

/// 하단 탭 4종. 가운데 업로드 버튼은 탭이 아니므로 값이 없다.
enum BottomDestination {
  home('home'),
  display('display'),
  record('record'),
  settings('settings');

  const BottomDestination(this.value);
  final String value;
}
