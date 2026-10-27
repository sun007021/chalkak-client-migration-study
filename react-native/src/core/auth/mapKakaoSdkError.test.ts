import { KakaoSdkCancelledError, KakaoSdkConfigError } from './KakaoSdk';
import { mapKakaoSdkError } from './mapKakaoSdkError';

describe('mapKakaoSdkError', () => {
  it('TC-AUTH-013 사용자 취소 메시지(iOS ClientFailed(Cancelled) / Android 취소)는 취소 오류다', () => {
    expect(
      mapKakaoSdkError({
        code: 'RNKakaoLogins',
        message: 'ClientFailed(Cancelled): user cancelled',
      }),
    ).toBeInstanceOf(KakaoSdkCancelledError);
    expect(mapKakaoSdkError(new Error('User canceled login'))).toBeInstanceOf(
      KakaoSdkCancelledError,
    );
  });

  it('TC-AUTH-018 앱 키 누락 메시지는 설정 오류다', () => {
    expect(
      mapKakaoSdkError(
        new Error('ClientFailed(MustInitAppKey): the Kakao SDK was never initialized'),
      ),
    ).toBeInstanceOf(KakaoSdkConfigError);
  });

  it('TC-AUTH-019 그 밖의 오류는 일반 오류 그대로다', () => {
    const original = new Error('AuthFailed(AccessDenied): denied');
    expect(mapKakaoSdkError(original)).toBe(original);
    expect(mapKakaoSdkError('boom')).toBeInstanceOf(Error);
  });
});
