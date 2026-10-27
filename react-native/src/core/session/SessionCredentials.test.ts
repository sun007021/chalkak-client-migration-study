import { credentialsFromTokenResponse, refreshedTokensFromResponse } from './SessionCredentials';

const NOW = new Date('2026-10-27T00:00:00.000Z');
// fixture: auth/social-login__login-success.json
const RESPONSE = {
  accessToken: 'a',
  expiresIn: 900,
  refreshToken: 'r',
  refreshTokenExpiresIn: 2_592_000,
};

describe('SessionCredentials', () => {
  it('TC-AUTH-007 만료 시각은 받은 시각 + 응답 초 값이다(하드코딩 아님)', () => {
    const credentials = credentialsFromTokenResponse('user-1', RESPONSE, NOW);
    expect(credentials).toEqual({
      userId: 'user-1',
      accessToken: 'a',
      accessTokenExpiresAt: new Date(NOW.getTime() + 900_000),
      refreshToken: 'r',
      refreshTokenExpiresAt: new Date(NOW.getTime() + 2_592_000_000),
    });
  });

  it('TC-AUTH-007 다른 수명 값(60초, 3600초)도 응답대로 계산한다', () => {
    const credentials = credentialsFromTokenResponse(
      'u',
      { ...RESPONSE, expiresIn: 60, refreshTokenExpiresIn: 3600 },
      NOW,
    );
    expect(credentials.accessTokenExpiresAt).toEqual(new Date(NOW.getTime() + 60_000));
    expect(credentials.refreshTokenExpiresAt).toEqual(new Date(NOW.getTime() + 3_600_000));
  });

  it('TC-NET-022 refresh 응답은 userId 없이 토큰 2종과 만료 2종을 만든다', () => {
    expect(refreshedTokensFromResponse(RESPONSE, NOW)).toEqual({
      accessToken: 'a',
      accessTokenExpiresAt: new Date(NOW.getTime() + 900_000),
      refreshToken: 'r',
      refreshTokenExpiresAt: new Date(NOW.getTime() + 2_592_000_000),
    });
  });
});
