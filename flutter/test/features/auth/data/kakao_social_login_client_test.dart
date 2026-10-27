import 'package:chalkak/features/auth/data/kakao_social_login_client.dart';
import 'package:chalkak/features/auth/domain/kakao_sdk_gateway.dart';
import 'package:chalkak/features/auth/domain/social_login_client.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/auth_fakes.dart';

void main() {
  late FakeKakaoSdkGateway sdk;
  late KakaoSocialLoginClient client;

  setUp(() {
    sdk = FakeKakaoSdkGateway();
    client = KakaoSocialLoginClient(sdk: sdk);
  });

  test('TC-AUTH-014 카카오톡 로그인이 가능하면 톡 로그인을 먼저 쓴다', () async {
    expect(await client.requestIdToken(nonce: 'hash'), 'talk-id-token');
    expect(sdk.calls, ['isInstalled', 'talk']);
    expect(sdk.noncesReceived, ['hash'], reason: 'SDK에는 받은 nonce(해시)를 그대로 전달');
  });

  test('TC-AUTH-015 톡 로그인이 취소가 아닌 이유로 실패하면 계정 로그인으로 폴백한다', () async {
    sdk.talk = () => throw Exception('talk failed');
    expect(await client.requestIdToken(nonce: 'hash'), 'account-id-token');
    expect(sdk.calls, ['isInstalled', 'talk', 'account']);
    expect(sdk.noncesReceived, ['hash', 'hash']);
  });

  test('TC-AUTH-016 톡 로그인에서 사용자가 취소하면 계정 로그인으로 폴백하지 않는다', () async {
    sdk.talk = () => throw const KakaoSdkCancelledException();
    await expectLater(
      client.requestIdToken(nonce: 'hash'),
      throwsA(isA<SocialLoginCancelledException>()),
    );
    expect(sdk.calls, ['isInstalled', 'talk']);
  });

  test('TC-AUTH-017 카카오톡이 설치돼 있지 않으면 계정 로그인을 쓴다', () async {
    sdk.installed = false;
    expect(await client.requestIdToken(nonce: 'hash'), 'account-id-token');
    expect(sdk.calls, ['isInstalled', 'account']);
  });

  test('TC-AUTH-017 설치 확인이 실패하면 계정 로그인을 쓴다', () async {
    sdk.installedError = Exception('availability failed');
    expect(await client.requestIdToken(nonce: 'hash'), 'account-id-token');
    expect(sdk.calls, ['isInstalled', 'account']);
  });

  test('TC-AUTH-013 계정 로그인에서 사용자가 취소하면 취소 예외다', () async {
    sdk.installed = false;
    sdk.account = () => throw const KakaoSdkCancelledException();
    await expectLater(
      client.requestIdToken(nonce: 'hash'),
      throwsA(isA<SocialLoginCancelledException>()),
    );
  });

  test('TC-AUTH-018 SDK가 idToken 없이 성공하면(null) 설정 오류 예외다', () async {
    sdk.talk = () => null;
    await expectLater(
      client.requestIdToken(nonce: 'hash'),
      throwsA(isA<SocialLoginMissingIdTokenException>()),
    );
  });

  test('TC-AUTH-018 idToken이 빈 문자열이어도 설정 오류 예외다', () async {
    sdk.installed = false;
    sdk.account = () => '';
    await expectLater(
      client.requestIdToken(nonce: 'hash'),
      throwsA(isA<SocialLoginMissingIdTokenException>()),
    );
  });

  test(
    'TC-AUTH-019 계정 로그인의 일반 실패는 SocialLoginFailedException이다(원인 보존)',
    () async {
      sdk.installed = false;
      final cause = Exception('sdk down');
      sdk.account = () => throw cause;
      await expectLater(
        client.requestIdToken(nonce: 'hash'),
        throwsA(
          isA<SocialLoginFailedException>().having(
            (e) => e.cause,
            'cause',
            cause,
          ),
        ),
      );
    },
  );

  test('TC-AUTH-015 톡 실패 뒤 폴백한 계정 로그인도 실패하면 실패 예외다', () async {
    sdk.talk = () => throw Exception('talk failed');
    sdk.account = () => throw Exception('account failed');
    await expectLater(
      client.requestIdToken(nonce: 'hash'),
      throwsA(isA<SocialLoginFailedException>()),
    );
  });

  test('TC-AUTH-015 톡 로그인이 idToken 없이 성공하면 폴백하지 않고 설정 오류다', () async {
    sdk.talk = () => null;
    await expectLater(
      client.requestIdToken(nonce: 'hash'),
      throwsA(isA<SocialLoginMissingIdTokenException>()),
    );
    expect(sdk.calls, ['isInstalled', 'talk']);
  });
}
