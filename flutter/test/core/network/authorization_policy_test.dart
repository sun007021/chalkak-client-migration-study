import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/core/network/api_request.dart';
import 'package:chalkak/core/network/authorization_policy.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/net_harness.dart';

void main() {
  final now = t0;
  final live = sessionAt();
  Uri api(String path) => Uri.parse('https://api.test/api/v1$path');

  bool attaches(Uri url, HttpMethod m, Session? s) =>
      AuthorizationPolicy.attaches(url: url, method: m, session: s, now: now);

  test('TC-AUTH-054 만료되지 않은 access token은 붙인다', () {
    expect(attaches(api('/posts/today'), HttpMethod.get, live), isTrue);
    expect(attaches(api('/users/me'), HttpMethod.delete, live), isTrue);
  });

  test('TC-AUTH-054 TC-NET-014 만료 시각이 now 이하이면 붙이지 않는다', () {
    final atNow = sessionAt(accessLeft: Duration.zero);
    final past = sessionAt(accessLeft: const Duration(seconds: -1));
    final justBefore = sessionAt(accessLeft: const Duration(seconds: 1));
    expect(attaches(api('/posts/today'), HttpMethod.get, atNow), isFalse);
    expect(attaches(api('/posts/today'), HttpMethod.get, past), isFalse);
    expect(attaches(api('/posts/today'), HttpMethod.get, justBefore), isTrue);
  });

  test('TC-NET-013 세션이 없거나 게스트면 붙이지 않는다', () {
    expect(attaches(api('/posts'), HttpMethod.get, null), isFalse);
    expect(attaches(api('/posts'), HttpMethod.get, Session.guest()), isFalse);
  });

  test('TC-AUTH-055 TC-NET-051 http(비 TLS) URL에는 붙이지 않는다', () {
    expect(
      attaches(Uri.parse('http://api.test/api/v1/posts'), HttpMethod.get, live),
      isFalse,
    );
  });

  test('REQ-NET-004 loopback 호스트의 http(mock 서버)에는 붙이고 그 밖의 http에는 붙이지 않는다', () {
    for (final host in ['localhost:8080', '127.0.0.1:3000', '10.0.2.2:8080']) {
      expect(
        attaches(Uri.parse('http://$host/api/v1/posts'), HttpMethod.get, live),
        isTrue,
        reason: host,
      );
    }
    expect(
      attaches(
        Uri.parse('http://192.168.0.5/api/v1/posts'),
        HttpMethod.get,
        live,
      ),
      isFalse,
    );
  });

  test('TC-NET-031 /auth/** 전체에는 붙이지 않는다', () {
    expect(attaches(api('/auth/social-login'), HttpMethod.post, live), isFalse);
    expect(
      attaches(api('/auth/social-signup'), HttpMethod.post, live),
      isFalse,
    );
  });

  test('TC-NET-031 REQ-NET-017 refresh, logout, banners에는 붙이지 않는다', () {
    expect(attaches(api('/auth/refresh'), HttpMethod.post, live), isFalse);
    expect(attaches(api('/auth/logout'), HttpMethod.post, live), isFalse);
    expect(attaches(api('/banners'), HttpMethod.get, live), isFalse);
  });

  test('TC-NET-044 /api/v1 밖 URL(presigned)에는 붙이지 않는다', () {
    expect(
      attaches(
        Uri.parse('https://bucket.s3.test/u/1?X-Amz-Signature=s'),
        HttpMethod.put,
        live,
      ),
      isFalse,
    );
  });
}
