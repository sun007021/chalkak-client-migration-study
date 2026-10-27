import { SocialLoginError } from '../../core/auth/SocialLoginClient';
import {
  AuthenticationRequiredError,
  CancelledError,
  HttpError,
  InvalidResponseError,
  NetworkError,
  TimeoutError,
} from '../../core/http/ApiError';
import { t } from '../../shared/copy';
import { mapLoginError } from './LoginErrorMapper';

describe('mapLoginError', () => {
  it('TC-AUTH-020 401 UNAUTHORIZED는 카카오 계정 확인 문구다', () => {
    expect(
      mapLoginError(new HttpError(401, 'UNAUTHORIZED', '유효하지 않은 인증 정보입니다.')),
    ).toBe(t('auth.login.error.kakao-account'));
  });

  it('TC-AUTH-021 TC-AUTH-022 403 FORBIDDEN은 서버 message를 그대로 보여 준다', () => {
    expect(mapLoginError(new HttpError(403, 'FORBIDDEN', '차단된 소셜 계정입니다.'))).toBe(
      '차단된 소셜 계정입니다.',
    );
    expect(mapLoginError(new HttpError(403, 'FORBIDDEN', '탈퇴한 차단 소셜 계정입니다.'))).toBe(
      '탈퇴한 차단 소셜 계정입니다.',
    );
  });

  it('TC-AUTH-021 403인데 message가 없으면 일반 문구다', () => {
    expect(mapLoginError(new HttpError(403, 'FORBIDDEN', null))).toBe(
      t('auth.login.error.generic'),
    );
  });

  it.each([
    [
      '400 BUSINESS_ERROR',
      new HttpError(400, 'BUSINESS_ERROR', 'Authorization Code는 APPLE 로그인에만 필요합니다.'),
    ],
    ['500', new HttpError(500, 'INTERNAL_ERROR', null)],
    ['502 HTML(errorCode 없음)', new HttpError(502, null, null)],
    ['갱신 후에도 401', new AuthenticationRequiredError('x')],
    ['알 수 없는 오류', new Error('boom')],
  ])(
    'TC-AUTH-023 TC-AUTH-024 TC-AUTH-026 %s는 일반 문구이며 서버 message를 노출하지 않는다',
    (_name, error) => {
      expect(mapLoginError(error)).toBe(t('auth.login.error.generic'));
    },
  );

  it('TC-AUTH-025 연결 실패와 타임아웃은 네트워크 문구다', () => {
    expect(mapLoginError(new NetworkError('offline'))).toBe(t('auth.login.error.network'));
    expect(mapLoginError(new TimeoutError('timeout'))).toBe(t('auth.login.error.network'));
  });

  it('TC-AUTH-011 TC-AUTH-012 해석 불가 응답은 invalid-response 문구다', () => {
    expect(mapLoginError(new InvalidResponseError('unexpected response shape'))).toBe(
      t('auth.login.error.invalid-response'),
    );
  });

  it('TC-AUTH-018 TC-AUTH-019 SDK 오류는 reason에 따라 config / kakao-failed 문구다', () => {
    expect(mapLoginError(new SocialLoginError('config'))).toBe(t('auth.login.error.config'));
    expect(mapLoginError(new SocialLoginError('failed'))).toBe(t('auth.login.error.kakao-failed'));
  });

  it('TC-AUTH-031 취소(CancelledError)는 표시할 문구가 없다', () => {
    expect(mapLoginError(new CancelledError('aborted'))).toBeNull();
  });
});
