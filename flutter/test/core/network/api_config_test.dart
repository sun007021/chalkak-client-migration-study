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

    test('REQ-NET-004 loopback 호스트(localhost, 127.0.0.1, 10.0.2.2)의 http는 mock 서버용으로 허용한다', () {
      for (final (raw, expected) in [
        ('http://localhost:8080', 'http://localhost:8080/api/v1'),
        ('http://127.0.0.1:3000/', 'http://127.0.0.1:3000/api/v1'),
        ('http://10.0.2.2:8080/api/v1', 'http://10.0.2.2:8080/api/v1'),
        ('http://LOCALHOST', 'http://localhost/api/v1'),
      ]) {
        expect(ApiConfig.parse(raw).apiRoot.toString(), expected, reason: raw);
      }
    });

    test('REQ-NET-001 loopback이 아닌 http는 사설 IP·유사 호스트도 config 오류다', () {
      for (final raw in [
        'http://192.168.0.5:8080',
        'http://10.0.2.3',
        'http://localhost.evil.test',
        'http://127.0.0.1.evil.test',
        'http://[::1]:8080',
        'http://example.com',
      ]) {
        expect(
          () => ApiConfig.parse(raw),
          throwsA(isA<ApiError>().having((e) => e.isConfig, 'isConfig', true)),
          reason: raw,
        );
      }
    });

    test('TC-NET-050 서버 origin이 아닌 경로·쿼리·사용자 정보는 config 오류다', () {
      for (final raw in [
        'https://host/other',
        'https://host/api/v2',
        'https://host?x=1',
        'https://user:pw@host',
      ]) {
        expect(
          () => ApiConfig.parse(raw),
          throwsA(isA<ApiError>().having((e) => e.isConfig, 'isConfig', true)),
          reason: raw,
        );
      }
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
