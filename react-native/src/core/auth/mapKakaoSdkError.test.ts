import { KakaoSdkCancelledError, KakaoSdkConfigError } from './KakaoSdk';
import { mapKakaoSdkError } from './mapKakaoSdkError';

describe('mapKakaoSdkError', () => {
  it('TC-AUTH-013 취소 토큰(iOS ClientFailed(Cancelled), Android Cancelled)은 취소 오류다', () => {
    expect(
      mapKakaoSdkError({
        code: 'RNKakaoLogins',
        message: 'ClientFailed(Cancelled): user cancelled',
      }),
    ).toBeInstanceOf(KakaoSdkCancelledError);
    expect(mapKakaoSdkError(new Error('Cancelled'))).toBeInstanceOf(KakaoSdkCancelledError);
  });

  it('TC-AUTH-018 앱 키 누락 메시지는 설정 오류다', () => {
    expect(
      mapKakaoSdkError(
        new Error('ClientFailed(MustInitAppKey): the Kakao SDK was never initialized'),
      ),
    ).toBeInstanceOf(KakaoSdkConfigError);
    expect(
      mapKakaoSdkError(new Error('RNKakaoLogins: string resource `kakao_app_key` not found.')),
    ).toBeInstanceOf(KakaoSdkConfigError);
  });

  it('TC-AUTH-019 cancel이 들어간 일반 문장이나 app key 언급만으로는 오분류하지 않는다', () => {
    for (const message of [
      'request was canceled by server',
      'invalid app key format',
      'ClientFailed(Unknown)',
    ]) {
      const mapped = mapKakaoSdkError(new Error(message));
      expect(mapped).not.toBeInstanceOf(KakaoSdkCancelledError);
      expect(mapped).not.toBeInstanceOf(KakaoSdkConfigError);
    }
  });

  it('TC-AUTH-019 그 밖의 오류는 일반 오류 그대로다', () => {
    const original = new Error('AuthFailed(AccessDenied): denied');
    expect(mapKakaoSdkError(original)).toBe(original);
    expect(mapKakaoSdkError('boom')).toBeInstanceOf(Error);
  });
});
