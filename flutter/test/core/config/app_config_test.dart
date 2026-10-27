import 'package:chalkak/core/config/app_config.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('유효한 값이면 설정을 만들고 강제 업데이트 조회는 기본으로 꺼져 있다', () {
    final c = AppConfig.parse(
      apiBaseUrl: 'https://chalkak-dev.pysun.kr',
      kakaoNativeAppKey: ' key-1 ',
    );
    expect(c.api.apiRoot.toString(), 'https://chalkak-dev.pysun.kr/api/v1');
    expect(c.kakaoNativeAppKey, 'key-1');
    expect(c.forceUpdateCheckEnabled, isFalse);
  });

  test('API_BASE_URL이 비었거나 http(비 loopback)면 설정 오류다', () {
    for (final url in [null, '', 'http://chalkak-dev.pysun.kr', 'nonsense']) {
      expect(
        () => AppConfig.parse(apiBaseUrl: url, kakaoNativeAppKey: 'k'),
        throwsA(isA<AppConfigException>()),
        reason: '$url',
      );
    }
  });

  test('KAKAO_NATIVE_APP_KEY가 비거나 공백이면 설정 오류다', () {
    for (final key in [null, '', '  ']) {
      expect(
        () => AppConfig.parse(
          apiBaseUrl: 'https://chalkak-dev.pysun.kr',
          kakaoNativeAppKey: key,
        ),
        throwsA(isA<AppConfigException>()),
        reason: '$key',
      );
    }
  });
}
