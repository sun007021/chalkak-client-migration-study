import { ApiError, InvalidResponseError } from '../../core/net/errors';
import { makeApiEnv } from '../../test/apiEnv';
import { NOW, ME, guestSession, loadFixture, memberSession } from '../../test/fixtures';
import { track } from '../../test/track';
import { SignupRepository } from './SignupRepository';

const credential = { idToken: 'fake-id-token-1', rawNonce: 'fake-raw-nonce-1' };

function setup(session = guestSession) {
  const env = makeApiEnv(session);
  return { ...env, repo: new SignupRepository({ api: env.client(), clock: env.clock }) };
}
const respond = (fixture: string) => () => loadFixture(fixture).toResponse();

describe('SignupRepository.requestUpload', () => {
  it('TC-ONB-020 POST /auth/social-signup/signature/uploads 바디는 {provider:"KAKAO", idToken, rawNonce}뿐이고 authorizationCode 키·Authorization 헤더가 없다', async () => {
    const { ff, repo } = setup(memberSession()); // 토큰이 저장돼 있어도 붙이지 않는다
    ff.route('POST /auth/social-signup/signature/uploads', respond('onboarding/signup-uploads__success.json'));
    await repo.requestUpload(credential);
    expect(ff.calls).toHaveLength(1);
    const call = ff.calls[0]!;
    expect(JSON.parse(call.body as string)).toEqual({ provider: 'KAKAO', idToken: 'fake-id-token-1', rawNonce: 'fake-raw-nonce-1' });
    expect(call.body as string).not.toContain('authorizationCode');
    expect(call.headers['authorization']).toBeUndefined();
  });

  it('TC-ONB-021 응답에서 uploadId, uploadUrl, expiresInSeconds(300), signupToken을 읽는다', async () => {
    const { ff, repo } = setup();
    ff.route('POST /auth/social-signup/signature/uploads', respond('onboarding/signup-uploads__success.json'));
    const ticket = await repo.requestUpload(credential);
    const body = loadFixture('onboarding/signup-uploads__success.json').json as Record<string, unknown>;
    expect(ticket).toEqual({ uploadId: body.uploadId, uploadUrl: body.uploadUrl, expiresInSeconds: 300, signupToken: body.signupToken });
  });

  it('TC-ONB-021 필수 필드(signupToken)가 없으면 InvalidResponseError다', async () => {
    const { ff, repo } = setup();
    ff.route('POST /auth/social-signup/signature/uploads', () => Response.json({ uploadId: 'u', uploadUrl: 'https://x.test/p', expiresInSeconds: 300 }));
    await expect(repo.requestUpload(credential)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-ONB-031 400 BUSINESS_ERROR(이미 가입된 계정)는 ApiError(400, BUSINESS_ERROR)로 던진다', async () => {
    const { ff, repo } = setup();
    ff.route('POST /auth/social-signup/signature/uploads', respond('onboarding/signup-uploads__already-registered.json'));
    await expect(repo.requestUpload(credential)).rejects.toMatchObject({ status: 400, errorCode: 'BUSINESS_ERROR' });
  });

  it.each([
    ['TC-ONB-033', 'onboarding/signup-uploads__unauthorized.json', 401, 'UNAUTHORIZED'],
    ['TC-ONB-032', 'onboarding/signup-uploads__forbidden-banned.json', 403, 'FORBIDDEN'],
  ])('%s 오류 응답 %s는 ApiError(%i, %s)다', async (_tc, fixture, status, code) => {
    const { ff, repo } = setup();
    ff.route('POST /auth/social-signup/signature/uploads', respond(fixture));
    await expect(repo.requestUpload(credential)).rejects.toMatchObject({ status, errorCode: code });
  });

  it('TC-ONB-042 500 INTERNAL_ERROR도 자동 재시도하지 않는다(D-21: /auth/social-* POST)', async () => {
    const { ff, clock, repo } = setup();
    ff.route('POST /auth/social-signup/signature/uploads', respond('common/error__internal-500.json'));
    const result = track(repo.requestUpload(credential));
    await clock.advance(10_000);
    expect(result.state).toBe('rejected');
    expect(result.error).toBeInstanceOf(ApiError);
    expect(ff.calls).toHaveLength(1);
  });
});

describe('SignupRepository.signUp', () => {
  it('TC-ONB-023 POST /auth/social-signup 바디는 {signupToken}뿐이고 Authorization 헤더가 없다', async () => {
    const { ff, repo } = setup(memberSession());
    ff.route('POST /auth/social-signup', respond('onboarding/signup__success.json'));
    await repo.signUp('fixture-signup-token-1');
    const call = ff.calls[0]!;
    expect(JSON.parse(call.body as string)).toEqual({ signupToken: 'fixture-signup-token-1' });
    expect(call.headers['authorization']).toBeUndefined();
  });

  it('TC-ONB-024 응답의 userId와 토큰 4종을 읽고 만료 시각을 clock.nowMs() + 응답 초 × 1000으로 계산한다', async () => {
    const { ff, repo } = setup();
    const body = loadFixture('onboarding/signup__success.json').json as Record<string, unknown>;
    ff.route('POST /auth/social-signup', respond('onboarding/signup__success.json'));
    expect(await repo.signUp('t')).toEqual({
      userId: ME,
      tokens: { accessToken: body.accessToken, accessTokenExpiresAt: NOW + 900_000, refreshToken: body.refreshToken, refreshTokenExpiresAt: NOW + 2_592_000_000 },
    });
  });

  it('TC-ONB-026 400 SIGNATURE_PROCESSING_PENDING은 ApiError로 errorCode를 보존한다(재시도는 서비스가 한다)', async () => {
    const { ff, repo } = setup();
    ff.route('POST /auth/social-signup', respond('onboarding/signup__signature-processing-pending.json'));
    await expect(repo.signUp('t')).rejects.toMatchObject({ status: 400, errorCode: 'SIGNATURE_PROCESSING_PENDING' });
    expect(ff.calls).toHaveLength(1);
  });

  it.each([
    ['TC-ONB-030', 'onboarding/signup__unauthorized.json', 401, 'UNAUTHORIZED'],
    ['TC-ONB-034', 'onboarding/signup__already-used-token.json', 400, 'BUSINESS_ERROR'],
    ['TC-ONB-035', 'onboarding/signup__invalid-signature.json', 400, 'BUSINESS_ERROR'],
    ['TC-ONB-036', 'onboarding/signup__upload-not-found.json', 404, 'BUSINESS_ERROR'],
    ['TC-ONB-037', 'onboarding/signup__forbidden-banned.json', 403, 'FORBIDDEN'],
    ['TC-ONB-039', 'onboarding/signup__already-registered-withdrawn.json', 400, 'BUSINESS_ERROR'],
  ])('%s 오류 응답 %s는 ApiError(%i, %s)다', async (_tc, fixture, status, code) => {
    const { ff, repo } = setup();
    ff.route('POST /auth/social-signup', respond(fixture));
    await expect(repo.signUp('t')).rejects.toMatchObject({ status, errorCode: code });
  });

  it('TC-ONB-042 500 INTERNAL_ERROR도 자동 재시도하지 않는다', async () => {
    const { ff, clock, repo } = setup();
    ff.route('POST /auth/social-signup', respond('common/error__internal-500.json'));
    const result = track(repo.signUp('t'));
    await clock.advance(10_000);
    expect(result.state).toBe('rejected');
    expect(ff.calls).toHaveLength(1);
  });
});
