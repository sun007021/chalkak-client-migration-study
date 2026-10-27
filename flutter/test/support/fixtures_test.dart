import 'package:flutter_test/flutter_test.dart';

import 'fixtures.dart';

void main() {
  test('load: 오류 본문 fixture를 읽는다', () {
    final json = Fixture.load('common/error__business-400.json') as Map;
    expect(json['errorCode'], 'BUSINESS_ERROR');
    expect(json['message'], isNotEmpty);
  });

  test('load: 없는 파일은 ArgumentError', () {
    expect(() => Fixture.load('common/nope.json'), throwsArgumentError);
  });

  test('route: manifest의 method, path, status', () {
    final r = Fixture.route('common/error__business-400.json');
    expect(r.method, isNotEmpty);
    expect(r.path, startsWith('/api/v1/'));
    expect(r.status, 400);
  });

  test('route: 없는 이름은 ArgumentError', () {
    expect(() => Fixture.route('nope/x.json'), throwsArgumentError);
  });

  test('manifest 모든 항목의 fixture 파일이 존재한다', () {
    for (final r in Fixture.routes) {
      expect(() => Fixture.load(r.fixture), returnsNormally, reason: r.fixture);
    }
  });

  test('response: 일반 JSON', () {
    final r = Fixture.response('common/error__business-400.json');
    expect(r.isHttpResponse, isTrue);
    expect(r.contentType, 'application/json');
    expect(r.rawBody, isNull);
    expect(r.route.status, 400);
    expect(r.bodyText, contains('BUSINESS_ERROR'));
  });

  test('response: _raw 본문 없음', () {
    final r = Fixture.response('auth/logout__no-content.json');
    expect(r.rawBody, '');
    expect(r.bodyText, '');
    expect(r.contentType, isNull);
  });

  test('response: _raw + _contentType (HTML)', () {
    final r = Fixture.response('common/error__bad-gateway-html.json');
    expect(r.rawBody, contains('<'));
    expect(r.contentType, 'text/html');
  });

  test('response: _fault', () {
    final fault = Fixture.routes
        .map((r) => Fixture.response(r.fixture))
        .firstWhere((r) => r.isFault);
    expect(fault.fault, anyOf('timeout', 'disconnect'));
    expect(fault.isHttpResponse, isFalse);
  });

  test('response: _kind 는 HTTP 응답이 아니다', () {
    final kinds = Fixture.routes
        .map((r) => Fixture.response(r.fixture).kind)
        .whereType<String>()
        .toSet();
    expect(kinds, containsAll(['push', 'case', 'storage']));
    expect(Fixture.routes.where((r) => r.method == 'PUSH'), isNotEmpty);
  });
}
