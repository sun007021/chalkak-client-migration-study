import 'package:flutter/services.dart';
import 'package:kakao_flutter_sdk_user/kakao_flutter_sdk_user.dart' as kakao;

import '../domain/kakao_sdk_gateway.dart';

/// `kakao_flutter_sdk_user`(`UserApi.instance`)를 쓰는 실제 구현.
/// 테스트 대상이 아니다(로직 없이 SDK 호출과 취소 예외 변환만 한다).
/// `KakaoSdk.init(nativeAppKey: ...)`는 앱 시작 때 main에서 한 번 부른다.
class DefaultKakaoSdkGateway implements KakaoSdkGateway {
  @override
  Future<bool> isKakaoTalkInstalled() => kakao.isKakaoTalkInstalled();

  @override
  Future<String?> loginWithKakaoTalk({required String nonce}) =>
      _run(() => kakao.UserApi.instance.loginWithKakaoTalk(nonce: nonce));

  @override
  Future<String?> loginWithKakaoAccount({required String nonce}) =>
      _run(() => kakao.UserApi.instance.loginWithKakaoAccount(nonce: nonce));

  Future<String?> _run(Future<kakao.OAuthToken> Function() login) async {
    try {
      return (await login()).idToken;
    } on PlatformException catch (e) {
      if (e.code == 'CANCELED') throw const KakaoSdkCancelledException();
      rethrow;
    } on kakao.KakaoClientException catch (e) {
      if (e.reason == kakao.ClientErrorCause.cancelled) {
        throw const KakaoSdkCancelledException();
      }
      rethrow;
    }
  }
}
