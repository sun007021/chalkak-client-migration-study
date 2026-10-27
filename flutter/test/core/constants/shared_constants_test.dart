import 'dart:convert';
import 'dart:io';

import 'package:chalkak/core/analytics/analytics_constants.dart';
import 'package:chalkak/core/constants/app_constants.dart';
import 'package:chalkak/core/network/network_config.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fixtures.dart';

void main() {
  final c = jsonDecode(
    File('${Fixture.root.path}/../constants.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  Duration ms(String key) => Duration(milliseconds: c[key] as int);

  test('shared/constants.json 과 AppConstants 값이 같다', () {
    expect(AppConstants.serviceTimeZone, c['SERVICE_TIME_ZONE']);
    expect(AppConstants.firstTopicDate, c['FIRST_TOPIC_DATE']);
    expect(AppConstants.postTitleMax, c['POST_TITLE_MAX']);
    expect(AppConstants.feedbackMin, c['FEEDBACK_MIN']);
    expect(AppConstants.feedbackMax, c['FEEDBACK_MAX']);
    expect(AppConstants.postImageContentType, c['POST_IMAGE_CONTENT_TYPE']);
    expect(AppConstants.postImageMaxBytes, c['POST_IMAGE_MAX_BYTES']);
    expect(AppConstants.postImageMaxLongEdge, c['POST_IMAGE_MAX_LONG_EDGE']);
    expect(AppConstants.webpQualityLadder, c['WEBP_QUALITY_LADDER']);
    expect(AppConstants.webpShrinkFactor, c['WEBP_DOWNSCALE_FACTOR']);
    expect(
      AppConstants.webpShrinkMaxAttempts,
      c['WEBP_DOWNSCALE_MAX_ATTEMPTS'],
    );
    expect(
      AppConstants.uploadUrlSafetyMargin,
      ms('UPLOAD_URL_SAFETY_MARGIN_MS'),
    );
    expect(AppConstants.uploadIdClaimTtl, ms('UPLOAD_ID_CLAIM_TTL_MS'));
    final sig = c['SIGNATURE_PNG_SIZE'] as Map<String, dynamic>;
    expect(AppConstants.signaturePngWidth, sig['width']);
    expect(AppConstants.signaturePngHeight, sig['height']);
    expect(AppConstants.signaturePadding, sig['padding']);
    expect(AppConstants.signatureStrokeWidth, sig['strokeWidth']);
    expect(AppConstants.signatureContentType, c['SIGNATURE_CONTENT_TYPE']);
    expect(AppConstants.signatureMaxBytes, c['SIGNATURE_MAX_BYTES']);
    expect(
      AppConstants.signupPendingRetryInterval,
      ms('SIGNUP_PENDING_RETRY_INTERVAL_MS'),
    );
    expect(AppConstants.signupPendingRetryMax, c['SIGNUP_PENDING_RETRY_MAX']);
    expect(AppConstants.aiReviewPollInterval, ms('AI_REVIEW_POLL_INTERVAL_MS'));
    expect(AppConstants.aiReviewPollWindow, ms('AI_REVIEW_POLL_WINDOW_MS'));
    expect(AppConstants.pageSize, c['PAGE_SIZE']);
    expect(AppConstants.bannerPageSize, c['BANNER_PAGE_SIZE']);
    expect(AppConstants.toastDuration, ms('TOAST_DURATION_MS'));
    expect(AppConstants.splashPreloadMax, ms('SPLASH_PRELOAD_MAX_MS'));
    expect(AppConstants.httpConnectTimeout, ms('HTTP_CONNECT_TIMEOUT_MS'));
    expect(AppConstants.httpResponseTimeout, ms('HTTP_RESPONSE_TIMEOUT_MS'));
    expect(AppConstants.uploadPutTimeout, ms('UPLOAD_PUT_TIMEOUT_MS'));
    expect(AppConstants.retryBackoff, [
      for (final v in c['RETRY_BACKOFF_MS'] as List)
        Duration(milliseconds: v as int),
    ]);
    expect(AppConstants.retryMax, c['RETRY_MAX']);
    expect(NetworkConfig.maxRetryAfter, ms('RETRY_AFTER_MAX_MS'));
    expect(AppConstants.versionLookupTimeout, ms('VERSION_LOOKUP_TIMEOUT_MS'));
    expect(AppConstants.termsAllowedHosts, c['TERMS_ALLOWED_HOSTS']);
    final terms = c['TERMS_URLS'] as Map<String, dynamic>;
    expect(AppConstants.termsServiceUrl, terms['service']);
    expect(AppConstants.termsPrivacyUrl, terms['privacy']);
  });

  test('분석 화면 이름과 탭 destination 이 json 과 같다 (순서 포함)', () {
    expect(ScreenNames.all, c['ANALYTICS_SCREEN_NAMES']);
    expect([
      for (final d in BottomDestination.values) d.value,
    ], c['ANALYTICS_TAB_DESTINATIONS']);
  });

  test('json 의 모든 키를 이 테스트가 확인한다 (새 키 누락 방지)', () {
    const checked = {
      'SERVICE_TIME_ZONE', 'FIRST_TOPIC_DATE', 'POST_TITLE_MAX', 'FEEDBACK_MIN',
      'FEEDBACK_MAX', 'POST_IMAGE_CONTENT_TYPE', 'POST_IMAGE_MAX_BYTES',
      'POST_IMAGE_MAX_LONG_EDGE',
      'WEBP_QUALITY_LADDER',
      'WEBP_DOWNSCALE_FACTOR',
      'WEBP_DOWNSCALE_MAX_ATTEMPTS', 'UPLOAD_URL_SAFETY_MARGIN_MS',
      'UPLOAD_ID_CLAIM_TTL_MS', 'SIGNATURE_PNG_SIZE', 'SIGNATURE_CONTENT_TYPE',
      'SIGNATURE_MAX_BYTES', 'SIGNUP_PENDING_RETRY_INTERVAL_MS',
      'SIGNUP_PENDING_RETRY_MAX', 'AI_REVIEW_POLL_INTERVAL_MS',
      'AI_REVIEW_POLL_WINDOW_MS', 'PAGE_SIZE', 'BANNER_PAGE_SIZE',
      'TOAST_DURATION_MS', 'SPLASH_PRELOAD_MAX_MS', 'HTTP_CONNECT_TIMEOUT_MS',
      'HTTP_RESPONSE_TIMEOUT_MS', 'UPLOAD_PUT_TIMEOUT_MS', 'RETRY_BACKOFF_MS',
      'RETRY_MAX',
      'RETRY_AFTER_MAX_MS',
      'VERSION_LOOKUP_TIMEOUT_MS',
      'TERMS_ALLOWED_HOSTS',
      'TERMS_URLS', 'ANALYTICS_SCREEN_NAMES', 'ANALYTICS_TAB_DESTINATIONS',
      'FIXTURE_NOW', // 테스트 시계 기준. AppConstants 대상 아님
    };
    expect(c.keys.toSet().difference(checked), isEmpty);
  });
}
