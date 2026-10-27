import 'package:chalkak/core/constants/app_constants.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  // TODO(shared): shared/constants.json 대조 테스트는 파일이 생긴 뒤 추가한다.
  test('00-overview §6 상수 값', () {
    expect(AppConstants.serviceTimeZone, 'Asia/Seoul');
    expect(AppConstants.firstTopicDate, '2026-09-17');
    expect(AppConstants.postTitleMax, 10);
    expect(AppConstants.feedbackMax, 1000);
    expect(AppConstants.feedbackMin, 1);
    expect(AppConstants.postImageContentType, 'image/webp');
    expect(AppConstants.postImageMaxBytes, 5242880);
    expect(AppConstants.postImageMaxLongEdge, 4096);
    expect(AppConstants.webpQualityLadder, [90, 80, 60, 40]);
    expect(AppConstants.webpShrinkFactor, 0.85);
    expect(AppConstants.webpShrinkMaxAttempts, 3);
    expect(AppConstants.uploadUrlSafetyMargin, const Duration(seconds: 5));
    expect(AppConstants.signaturePngWidth, 1024);
    expect(AppConstants.signaturePngHeight, 512);
    expect(AppConstants.signaturePadding, 48);
    expect(AppConstants.signatureStrokeWidth, 14);
    expect(AppConstants.signatureMaxBytes, 1048576);
    expect(AppConstants.signupPendingRetryInterval, const Duration(seconds: 1));
    expect(AppConstants.signupPendingRetryMax, 10);
    expect(AppConstants.aiReviewPollInterval, const Duration(seconds: 3));
    expect(AppConstants.aiReviewPollWindow, const Duration(seconds: 300));
    expect(AppConstants.pageSize, 20);
    expect(AppConstants.bannerPageSize, 10);
    expect(AppConstants.toastDuration, const Duration(milliseconds: 2500));
    expect(AppConstants.splashPreloadMax, const Duration(milliseconds: 700));
  });
}
