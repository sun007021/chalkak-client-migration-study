import 'package:chalkak/features/boot/data/itunes_lookup_client.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/auth_fakes.dart';
import '../../../support/fake_adapter.dart';
import '../../../support/net_harness.dart';

const _bundle = 'com.example.chalkak';

ItunesLookupClient _client(FakeAdapter a, {String? country = 'kr'}) =>
    ItunesLookupClient(bundleId: _bundle, countryCode: country, adapter: a);

void main() {
  test('TC-BOOT-021 URL에 bundleId, country, entity=software가 들어간다', () {
    final uri = ItunesLookupClient.buildUri(
      bundleId: _bundle,
      countryCode: 'KR',
    );
    expect(uri.host, 'itunes.apple.com');
    expect(uri.path, '/lookup');
    expect(uri.queryParameters['bundleId'], _bundle);
    expect(uri.queryParameters['country'], 'kr');
    expect(uri.queryParameters['entity'], 'software');
  });

  test('TC-BOOT-021 국가 코드를 못 읽으면(null·공백) 기본 국가를 쓴다', () {
    for (final c in <String?>[null, '', '  ']) {
      final uri = ItunesLookupClient.buildUri(
        bundleId: _bundle,
        countryCode: c,
      );
      expect(
        uri.queryParameters['country'],
        ItunesLookupClient.defaultCountry,
        reason: '"$c"',
      );
    }
  });

  test('TC-BOOT-021 요청이 실제로 그 URL로 나간다', () async {
    final a = FakeAdapter()
      ..on('GET', '/lookup', [
        fixtureResponse('boot/itunes-lookup__same.json'),
      ]);
    await _client(a).fetchLatestVersion();
    final r = a.requests.single;
    expect(r.uri.queryParameters['bundleId'], _bundle);
    expect(r.uri.queryParameters['entity'], 'software');
    expect(r.uri.queryParameters['country'], 'kr');
  });

  test('TC-BOOT-016 최신 version 문자열을 읽는다', () async {
    final a = FakeAdapter()
      ..on('GET', '/lookup', [
        fixtureResponse('boot/itunes-lookup__newer-major.json'),
      ]);
    expect(await _client(a).fetchLatestVersion(), '2.0.0');
  });

  test('TC-BOOT-022 results가 빈 배열이면 null', () async {
    final a = FakeAdapter()
      ..on('GET', '/lookup', [
        fixtureResponse('boot/itunes-lookup__empty-results.json'),
      ]);
    expect(await _client(a).fetchLatestVersion(), isNull);
  });

  test('TC-BOOT-022 results[0]에 version 필드가 없으면 null', () async {
    final a = FakeAdapter()
      ..on('GET', '/lookup', [
        FakeResponse.json(200, {
          'resultCount': 1,
          'results': [
            {'bundleId': _bundle},
          ],
        }),
      ]);
    expect(await _client(a).fetchLatestVersion(), isNull);
  });

  test('TC-BOOT-023 5xx와 네트워크 오류는 예외로 알린다', () async {
    final a = FakeAdapter()
      ..on('GET', '/lookup', [FakeResponse.json(503, const {})]);
    await expectLater(_client(a).fetchLatestVersion(), throwsA(anything));
    final b = FakeAdapter()
      ..on('GET', '/lookup', [const FakeResponse.fault(FakeFault.disconnect)]);
    await expectLater(_client(b).fetchLatestVersion(), throwsA(anything));
  });

  test('TC-BOOT-023 JSON이 아닌 본문도 예외다', () async {
    final a = FakeAdapter()
      ..on('GET', '/lookup', [
        const FakeResponse(body: '<html>', contentType: 'text/html'),
      ]);
    await expectLater(_client(a).fetchLatestVersion(), throwsA(anything));
  });

  test('TC-BOOT-024 2.9초 응답은 쓰고 3.1초 응답은 중단한다', () {
    fakeAsync((async) {
      final fast = FakeAdapter()
        ..on('GET', '/lookup', [
          FakeResponse.json(200, {
            'resultCount': 1,
            'results': [
              {'version': '2.0.0'},
            ],
          }, delay: const Duration(milliseconds: 2900)),
        ]);
      final okProbe = Probe(_client(fast).fetchLatestVersion());
      advance(async, const Duration(milliseconds: 2900));
      expect(okProbe.value, '2.0.0');

      final slow = FakeAdapter()
        ..on('GET', '/lookup', [
          FakeResponse.json(200, {
            'resultCount': 1,
            'results': [
              {'version': '2.0.0'},
            ],
          }, delay: const Duration(milliseconds: 3100)),
        ]);
      final slowProbe = Probe(_client(slow).fetchLatestVersion());
      advance(async, const Duration(milliseconds: 3100));
      expect(slowProbe.error, isA<Object>());
      expect(slowProbe.value, isNull);
    }, initialTime: t0);
  });

  test('TC-BOOT-024 timeout 설정이 3초(versionLookupTimeout)다', () async {
    final a = FakeAdapter()
      ..on('GET', '/lookup', [
        fixtureResponse('boot/itunes-lookup__same.json'),
      ]);
    await _client(a).fetchLatestVersion();
    final r = a.requests.single;
    expect(r.receiveTimeout, const Duration(seconds: 3));
    expect(r.connectTimeout, const Duration(seconds: 3));
  });

  test('요청 헤더에 Authorization이 없다(스토어는 우리 서버가 아니다)', () async {
    final a = FakeAdapter()
      ..on('GET', '/lookup', [
        fixtureResponse('boot/itunes-lookup__same.json'),
      ]);
    await ItunesLookupClient(
      bundleId: _bundle,
      adapter: a,
      baseUri: Uri.parse('https://itunes.apple.com'),
    ).fetchLatestVersion();
    expect(a.requests.single.hasAuthorization, isFalse);
  });
}
