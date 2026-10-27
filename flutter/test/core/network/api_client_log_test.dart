import 'dart:typed_data';

import 'package:chalkak/core/network/api_request.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_adapter.dart';
import '../../support/net_harness.dart';

void main() {
  const secrets = [
    'SECRET-AT-1',
    'SECRET-RT-1',
    'SECRET-AT-2',
    'SECRET-RT-2',
    'SECRET-IDTOKEN',
    'SECRET-NONCE',
    'SECRET-SIGNUP',
    'SECRET-FCM',
    'SECRET-SIG',
    'SECRET-CRED',
  ];

  netTest(
    'TC-NET-055 로그 sink에 토큰, idToken, rawNonce, signupToken, fcmToken, presigned 쿼리가 남지 않는다',
    (h, a) {
      // 401 → refresh 성공 흐름(토큰 헤더·refresh 본문)
      h.adapter.onDynamic(
        'GET',
        '$v1/a',
        (r) => r.header('authorization') == 'Bearer SECRET-AT-1'
            ? unauthorized()
            : ok(),
      );
      h.adapter.on('POST', '$v1/auth/refresh', [
        FakeResponse.json(200, refreshBody('SECRET-AT-2', 'SECRET-RT-2')),
      ]);
      Probe(
        h.client.request<Object?>(const ApiRequest.get('/a'), decode: (j) => j),
      );
      settle(a);

      // 소셜 로그인 본문 + 서버 오류
      h.adapter.on('POST', '$v1/auth/social-login', [
        FakeResponse.json(500, internalBody),
      ]);
      Probe<Object?>(
        h.client.requestNoContent(
          const ApiRequest(
            HttpMethod.post,
            '/auth/social-login',
            body: {
              'provider': 'KAKAO',
              'idToken': 'SECRET-IDTOKEN',
              'rawNonce': 'SECRET-NONCE',
            },
          ),
        ),
      );
      settle(a);
      h.adapter.on('POST', '$v1/auth/social-signup', [
        FakeResponse.json(400, businessBody),
      ]);
      Probe<Object?>(
        h.client.requestNoContent(
          const ApiRequest(
            HttpMethod.post,
            '/auth/social-signup',
            body: {'signupToken': 'SECRET-SIGNUP'},
          ),
        ),
      );
      settle(a);
      h.adapter.on('PUT', '$v1/push-devices/current', [
        const FakeResponse.empty(204),
      ]);
      Probe<Object?>(
        h.client.requestNoContent(
          const ApiRequest(
            HttpMethod.put,
            '/push-devices/current',
            body: {'fcmToken': 'SECRET-FCM'},
          ),
        ),
      );
      settle(a);

      // presigned PUT 성공과 실패
      final url = Uri.parse(
        'https://bucket.s3.test/u/1.webp?X-Amz-Signature=SECRET-SIG&X-Amz-Credential=SECRET-CRED',
      );
      h.adapter.on('PUT', '/u/1.webp', [const FakeResponse.empty(200)]);
      Probe(
        h.client.putPresigned(
          url: url,
          bytes: Uint8List(2),
          contentType: 'image/webp',
        ),
      );
      settle(a);
      h.adapter.on('PUT', '/u/2.webp', [const FakeResponse.empty(403)]);
      Probe(
        h.client.putPresigned(
          url: url.replace(path: '/u/2.webp'),
          bytes: Uint8List(2),
          contentType: 'image/webp',
        ),
      );
      advance(a, const Duration(seconds: 5));

      final log = h.logs.all;
      for (final s in secrets) {
        expect(log, isNot(contains(s)), reason: '로그에 $s 유출');
      }
    },
    session: sessionAt(at: 'SECRET-AT-1', rt: 'SECRET-RT-1'),
  );
}
