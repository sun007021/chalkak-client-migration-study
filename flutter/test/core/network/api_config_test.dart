import 'dart:io';

import 'package:chalkak/core/network/api_config.dart';
import 'package:chalkak/core/network/api_error.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('API_BASE_URL 검증', () {
    test('TC-NET-050 REQ-NET-003 https origin에 /api/v1을 붙인다', () {
      for (final raw in [
        'https://chalkak-dev.pysun.kr',
        'https://chalkak-dev.pysun.kr/',
        'https://chalkak-dev.pysun.kr/api/v1',
        'https://chalkak-dev.pysun.kr/api/v1/',
      ]) {
        expect(
          ApiConfig.parse(raw).apiRoot.toString(),
          'https://chalkak-dev.pysun.kr/api/v1',
          reason: raw,
        );
      }
    });

    test('TC-NET-050 포트가 있는 https 주소도 허용한다', () {
      expect(
        ApiConfig.parse('https://mock.local:8443').apiRoot.toString(),
        'https://mock.local:8443/api/v1',
      );
    });

    test('TC-NET-050 TC-NET-002 http, 빈 값, null, 스킴·호스트 없음은 config 오류다', () {
      for (final raw in <String?>[
        null,
        '',
        '   ',
        'http://chalkak-dev.pysun.kr',
        'ftp://chalkak-dev.pysun.kr',
        'chalkak-dev.pysun.kr',
        'https://',
        'not a url',
      ]) {
        expect(
          () => ApiConfig.parse(raw),
          throwsA(isA<ApiError>().having((e) => e.isConfig, 'isConfig', true)),
          reason: '$raw',
        );
      }
    });

    test('TC-NET-058 REQ-NET-002 소스에 개발 서버 주소 폴백이 하드코딩되어 있지 않다', () {
      final offenders = <String>[];
      for (final f
          in Directory('lib')
              .listSync(recursive: true)
              .whereType<File>()
              .where((f) => f.path.endsWith('.dart'))) {
        final text = f.readAsStringSync();
        if (text.contains('pysun.kr') || text.contains('http://')) {
          offenders.add(f.path);
        }
      }
      expect(offenders, isEmpty);
    });
  });
}
