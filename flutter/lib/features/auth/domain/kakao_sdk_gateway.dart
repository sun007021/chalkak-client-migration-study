/// kakao_flutter_sdk_user 호출을 감싼 가장 얇은 경계. 취소(KakaoClientException의
/// cancelled, PlatformException CANCELED)는 구현이 [KakaoSdkCancelledException]으로 바꿔 던진다.
abstract interface class KakaoSdkGateway {
  /// 확인 실패는 예외.
  Future<bool> isKakaoTalkInstalled();

  /// 카카오톡 앱 로그인. idToken이 없으면 null.
  Future<String?> loginWithKakaoTalk({required String nonce});

  /// 카카오계정(웹) 로그인. idToken이 없으면 null.
  Future<String?> loginWithKakaoAccount({required String nonce});
}

class KakaoSdkCancelledException implements Exception {
  const KakaoSdkCancelledException();
}
