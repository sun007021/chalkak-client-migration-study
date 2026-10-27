import '../domain/kakao_sdk_gateway.dart';

/// `kakao_flutter_sdk_user`(`UserApi.instance`)를 쓰는 실제 구현. 구현 PR에서 채운다.
/// 테스트 대상이 아니다(로직 없이 SDK 호출만 한다).
class DefaultKakaoSdkGateway implements KakaoSdkGateway {
  @override
  Future<bool> isKakaoTalkInstalled() => throw UnimplementedError();

  @override
  Future<String?> loginWithKakaoTalk({required String nonce}) =>
      throw UnimplementedError();

  @override
  Future<String?> loginWithKakaoAccount({required String nonce}) =>
      throw UnimplementedError();
}
