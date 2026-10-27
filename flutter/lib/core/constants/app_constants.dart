/// 00-overview §6 공통 상수. 하드코딩하지 말고 여기서만 가져다 쓴다.
/// 값은 shared/constants.json과 같아야 하며 test/core/constants/shared_constants_test.dart가 대조한다.
abstract final class AppConstants {
  static const serviceTimeZone = 'Asia/Seoul';

  /// 'yyyy-MM-dd'. 전시 날짜 이동·선택의 하한(D-12).
  static const firstTopicDate = '2026-09-17';

  static const postTitleMax = 10;
  static const feedbackMax = 1000;
  static const feedbackMin = 1;

  static const postImageContentType = 'image/webp';
  static const postImageMaxBytes = 5242880;
  static const postImageMaxLongEdge = 4096;

  static const webpQualityLadder = <int>[90, 80, 60, 40];
  static const webpShrinkFactor = 0.85;
  static const webpShrinkMaxAttempts = 3;

  static const uploadUrlSafetyMargin = Duration(seconds: 5);
  static const uploadIdClaimTtl = Duration(hours: 1);

  static const signatureContentType = 'image/png';
  static const signaturePngWidth = 1024;
  static const signaturePngHeight = 512;
  static const signaturePadding = 48;
  static const signatureStrokeWidth = 14;
  static const signatureMaxBytes = 1048576;

  static const signupPendingRetryInterval = Duration(seconds: 1);
  static const signupPendingRetryMax = 10;

  static const aiReviewPollInterval = Duration(seconds: 3);
  static const aiReviewPollWindow = Duration(seconds: 300);

  static const pageSize = 20;
  static const bannerPageSize = 10;

  static const toastDuration = Duration(milliseconds: 2500);
  static const splashPreloadMax = Duration(milliseconds: 700);

  static const httpConnectTimeout = Duration(seconds: 10);
  static const httpResponseTimeout = Duration(seconds: 15);
  static const uploadPutTimeout = Duration(seconds: 60);
  static const retryBackoff = <Duration>[
    Duration(milliseconds: 500),
    Duration(seconds: 1),
  ];
  static const retryMax = 2;
  static const versionLookupTimeout = Duration(seconds: 3);

  static const termsAllowedHosts = <String>[
    'notion.com',
    'notion.so',
    'notion.site',
  ];
  static const termsServiceUrl =
      'https://app.notion.com/p/3c66b8e8e3678064b543c26b5c0f932d?source=copy_link';
  static const termsPrivacyUrl =
      'https://app.notion.com/p/3b56b8e8e36780af8ec8ea0bf92b97a9?source=copy_link';
}
