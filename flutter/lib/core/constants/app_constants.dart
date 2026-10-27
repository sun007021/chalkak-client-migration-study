/// 00-overview §6 공통 상수. 하드코딩하지 말고 여기서만 가져다 쓴다.
// TODO(shared): shared/constants.json이 생기면 test/core/constants/app_constants_test.dart에서 대조한다.
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
}
