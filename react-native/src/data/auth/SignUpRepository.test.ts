import { HttpError } from '../../core/http/ApiError';
import { fixtureBody } from '../../core/http/__testing__/loadFixture';
import { routeFixtures } from '../../features/signature/__testing__/routes';
import { PENDING } from '../../features/onboarding/__testing__/createSignUpHarness';
import { createAuthHarness, type AuthHarness } from './__testing__/createAuthHarness';
import { SignUpRepository } from './SignUpRepository';

describe('SignUpRepository', () => {
  let h: AuthHarness;
  let repository: SignUpRepository;
  beforeEach(() => {
    h = createAuthHarness();
    repository = new SignUpRepository({ api: h.api, authRepository: h.repository });
  });

  it('TC-ONB-020 업로드 발급 바디는 {provider:"KAKAO", idToken, rawNonce}뿐이고 Authorization 헤더가 없다', async () => {
    routeFixtures(h.transport, {
      'POST /auth/social-signup/signature/uploads': 'onboarding/signup-uploads__success',
    });
    await h.signIn(); // 저장된 세션이 있어도 가입 호출에는 인증 헤더가 붙지 않아야 한다.
    await repository.requestUpload(PENDING);
    const [request] = h.transport.requests;
    expect(request.method).toBe('POST');
    expect(JSON.parse(request.body as string)).toEqual({
      provider: 'KAKAO',
      idToken: PENDING.idToken,
      rawNonce: PENDING.rawNonce,
    });
    expect(Object.keys(JSON.parse(request.body as string))).not.toContain('authorizationCode');
    expect(request.headers).not.toHaveProperty('Authorization');
  });

  it('TC-ONB-021 발급 응답에서 uploadId, uploadUrl, expiresInSeconds(300), signupToken을 읽는다', async () => {
    routeFixtures(h.transport, {
      'POST /auth/social-signup/signature/uploads': 'onboarding/signup-uploads__success',
    });
    const fixture = fixtureBody<Record<string, unknown>>('onboarding/signup-uploads__success');
    expect(await repository.requestUpload(PENDING)).toEqual({
      uploadId: fixture.uploadId,
      uploadUrl: fixture.uploadUrl,
      expiresInSeconds: 300,
      signupToken: fixture.signupToken,
    });
  });

  it('TC-ONB-021 필수 필드가 빠진 발급 응답은 InvalidResponseError', async () => {
    h.transport.script({
      status: 200,
      headers: { 'content-type': 'application/json' },
      bodyText: JSON.stringify({ uploadId: 'x', uploadUrl: 'https://s3.example/x' }),
    });
    await expect(repository.requestUpload(PENDING)).rejects.toMatchObject({
      name: 'InvalidResponseError',
    });
  });

  it('TC-ONB-022 presigned PUT: Content-Type image/png, 인증 헤더 없음, 본문은 PNG 바이트 전체', async () => {
    routeFixtures(h.transport, { 'PUT /__upload': 'onboarding/presigned-put__ok' });
    await h.signIn();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9]);
    await repository.uploadPng('http://localhost:4010/__upload/x?X-Amz-Expires=300', png);
    const [request] = h.transport.requests;
    expect(request.headers['Content-Type']).toBe('image/png');
    expect(request.headers).not.toHaveProperty('Authorization');
    expect(request.body).toEqual(png);
  });

  it('TC-ONB-023 가입 확정 바디는 {signupToken}뿐이다', async () => {
    routeFixtures(h.transport, { 'POST /auth/social-signup': 'onboarding/signup__success' });
    await repository.confirm('fixture-signup-token-1');
    const [request] = h.transport.requests;
    expect(JSON.parse(request.body as string)).toEqual({ signupToken: 'fixture-signup-token-1' });
    expect(request.headers).not.toHaveProperty('Authorization');
  });

  it('TC-ONB-024 TC-ONB-025 가입 200이면 토큰 4종과 userId를 저장하고 추가 호출(social-login 등)이 없다', async () => {
    routeFixtures(h.transport, { 'POST /auth/social-signup': 'onboarding/signup__success' });
    const fixture = fixtureBody<Record<string, string | number>>('onboarding/signup__success');
    const result = await repository.confirm('fixture-signup-token-1');

    expect(result).toEqual({ userId: fixture.userId });
    expect(h.transport.requests).toHaveLength(1);
    const state = await h.sessionStore.load();
    expect(state).toMatchObject({
      kind: 'authenticated',
      credentials: {
        userId: fixture.userId,
        accessToken: fixture.accessToken,
        refreshToken: fixture.refreshToken,
      },
    });
    // 수명(초)은 받은 시각에 더해 절대 시각으로 저장한다.
    const credentials = (state as { credentials: { accessTokenExpiresAt: Date } }).credentials;
    expect(credentials.accessTokenExpiresAt.getTime()).toBe(
      h.clock.now().getTime() + Number(fixture.expiresIn) * 1000,
    );
  });

  it('TC-ONB-024 이전 계정의 사용자 캐시를 세션 저장 전에 비운다', async () => {
    routeFixtures(h.transport, { 'POST /auth/social-signup': 'onboarding/signup__success' });
    await repository.confirm('t');
    expect(h.cache.clearCalls).toBeGreaterThan(0);
  });

  it('TC-ONB-042 가입 POST는 5xx여도 자동 재시도하지 않는다(업로드 발급 포함)', async () => {
    routeFixtures(h.transport, {
      'POST /auth/social-signup/signature/uploads': 'common/error__internal-500',
      'POST /auth/social-signup': 'common/error__internal-500',
    });
    await expect(repository.requestUpload(PENDING)).rejects.toBeInstanceOf(HttpError);
    await expect(repository.confirm('t')).rejects.toBeInstanceOf(HttpError);
    expect(h.transport.requests).toHaveLength(2);
    expect(h.sleeper.calls).toEqual([]);
  });

  it('TC-ONB-026 400 SIGNATURE_PROCESSING_PENDING은 errorCode로 구분되어 던져지고 세션은 저장되지 않는다', async () => {
    routeFixtures(h.transport, {
      'POST /auth/social-signup': 'onboarding/signup__signature-processing-pending',
    });
    await expect(repository.confirm('t')).rejects.toMatchObject({
      status: 400,
      errorCode: 'SIGNATURE_PROCESSING_PENDING',
    });
    expect((await h.sessionStore.load()).kind).not.toBe('authenticated');
  });
});
