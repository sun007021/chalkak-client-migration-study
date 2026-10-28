import { ApiError, InvalidResponseError } from '../../core/net/errors';
import { makeApiEnv } from '../../test/apiEnv';
import { loadFixture, memberSession } from '../../test/fixtures';
import { track } from '../../test/track';
import { SignatureRepository } from './SignatureRepository';

function setup(session = memberSession()) {
  const env = makeApiEnv(session);
  return { ...env, repo: new SignatureRepository({ api: env.client() }) };
}
const respond = (fixture: string) => () => loadFixture(fixture).toResponse();

describe('SignatureRepository.requestUpload', () => {
  it('TC-SIGN-019 POST /users/me/signature/uploads는 본문 없이 Bearer와 함께 보낸다', async () => {
    const { ff, repo } = setup();
    ff.route('POST /users/me/signature/uploads', respond('signature/users-me-signature-uploads__success.json'));
    await repo.requestUpload();
    const call = ff.calls[0]!;
    expect(call.body).toBeNull();
    expect(call.headers['authorization']).toBe('Bearer fixture-access-token-1');
  });

  it('TC-SIGN-020 uploadId, uploadUrl, expiresInSeconds만 읽고 contentType·maxBytes가 없어도 오류가 아니다', async () => {
    const { ff, repo } = setup();
    ff.route('POST /users/me/signature/uploads', respond('signature/users-me-signature-uploads__success.json'));
    const body = loadFixture('signature/users-me-signature-uploads__success.json').json as Record<string, unknown>;
    expect(body).not.toHaveProperty('contentType');
    expect(body).not.toHaveProperty('maxBytes');
    expect(await repo.requestUpload()).toEqual({ uploadId: body.uploadId, uploadUrl: body.uploadUrl, expiresInSeconds: 300 });
  });

  it('TC-SIGN-020 uploadUrl이 없으면 InvalidResponseError다', async () => {
    const { ff, repo } = setup();
    ff.route('POST /users/me/signature/uploads', () => Response.json({ uploadId: 'u', expiresInSeconds: 300 }));
    await expect(repo.requestUpload()).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-SIGN-030 403 FORBIDDEN(정지 회원)은 ApiError(403)이고 재요청하지 않는다', async () => {
    const { ff, clock, repo } = setup();
    ff.route('POST /users/me/signature/uploads', respond('signature/users-me-signature-uploads__forbidden-banned.json'));
    const result = track(repo.requestUpload());
    await clock.advance(5_000);
    expect(result.error).toMatchObject({ status: 403, errorCode: 'FORBIDDEN' });
    expect(ff.calls).toHaveLength(1);
  });

  it('TC-SIGN-035 업로드 정책 발급은 멱등이라 500이면 0.5초, 1초 백오프로 최대 2회 재시도한 뒤 실패한다(총 3회)', async () => {
    const { ff, clock, repo } = setup();
    ff.route('POST /users/me/signature/uploads', respond('common/error__internal-500.json'));
    const result = track(repo.requestUpload());
    await clock.advance(0);
    expect(ff.calls).toHaveLength(1);
    await clock.advance(499);
    expect(ff.calls).toHaveLength(1);
    await clock.advance(1);
    expect(ff.calls).toHaveLength(2);
    await clock.advance(1_000);
    expect(ff.calls).toHaveLength(3);
    await clock.advance(10_000);
    expect(ff.calls).toHaveLength(3);
    expect(result.state).toBe('rejected');
    expect(result.error).toBeInstanceOf(ApiError);
  });
});

describe('SignatureRepository.confirm', () => {
  it('TC-SIGN-022 PUT /users/me/signature 바디는 {signatureOriginalUploadId}뿐이다', async () => {
    const { ff, repo } = setup();
    ff.route('PUT /users/me/signature', respond('signature/users-me-signature__put-success.json'));
    await repo.confirm('55555555-5555-4555-8555-555555555521');
    const call = ff.calls[0]!;
    expect(call.method).toBe('PUT');
    expect(JSON.parse(call.body as string)).toEqual({ signatureOriginalUploadId: '55555555-5555-4555-8555-555555555521' });
    expect(call.headers['authorization']).toBe('Bearer fixture-access-token-1');
  });

  it('TC-SIGN-027 응답의 URL은 쓰지 않는다 — 결과는 void다', async () => {
    const { ff, repo } = setup();
    ff.route('PUT /users/me/signature', respond('signature/users-me-signature__put-success.json'));
    expect(await repo.confirm('u')).toBeUndefined();
  });

  it.each([
    ['TC-SIGN-028', 'signature/users-me-signature__put-reupload-required.json', 400, 'SIGNATURE_REUPLOAD_REQUIRED'],
    ['TC-SIGN-029', 'signature/users-me-signature__put-invalid-signature.json', 400, 'BUSINESS_ERROR'],
    ['TC-SIGN-031', 'signature/users-me-signature__put-forbidden-banned.json', 403, 'FORBIDDEN'],
    ['TC-SIGN-032', 'signature/users-me-signature__put-upload-not-found.json', 404, 'BUSINESS_ERROR'],
  ])('%s 오류 응답 %s는 ApiError(%i, %s)다', async (_tc, fixture, status, code) => {
    const { ff, repo } = setup();
    ff.route('PUT /users/me/signature', respond(fixture));
    await expect(repo.confirm('u')).rejects.toMatchObject({ status, errorCode: code });
  });
});

describe('SignatureRepository.fetchCurrent', () => {
  it('TC-SIGN-026 GET /users/me/signature에서 썸네일이 있으면 썸네일을 displayUrl로 쓴다', async () => {
    const { ff, repo } = setup();
    ff.route('GET /users/me/signature', respond('signature/users-me-signature__get-success.json'));
    const body = loadFixture('signature/users-me-signature__get-success.json').json as Record<string, string>;
    const current = await repo.fetchCurrent();
    expect(current).toEqual({ originalUrl: body.signatureOriginalImageUrl, thumbnailUrl: body.signatureThumbnailImageUrl, displayUrl: body.signatureThumbnailImageUrl });
  });

  it('TC-SIGN-026 썸네일이 null이면 원본을 displayUrl로 쓰고, 원본을 썸네일 자리에 넣지 않는다', async () => {
    const { ff, repo } = setup();
    ff.route('GET /users/me/signature', respond('signature/users-me-signature__get-thumbnail-null.json'));
    const body = loadFixture('signature/users-me-signature__get-thumbnail-null.json').json as Record<string, string>;
    const current = await repo.fetchCurrent();
    expect(current.thumbnailUrl).toBeNull();
    expect(current.originalUrl).toBe(body.signatureOriginalImageUrl);
    expect(current.displayUrl).toBe(body.signatureOriginalImageUrl);
  });

  it('TC-SIGN-040 400 SIGNATURE_REGISTRATION_REQUIRED는 ApiError로 errorCode를 보존한다', async () => {
    const { ff, repo } = setup();
    ff.route('GET /users/me/signature', respond('signature/users-me-signature__get-registration-required.json'));
    await expect(repo.fetchCurrent()).rejects.toMatchObject({ status: 400, errorCode: 'SIGNATURE_REGISTRATION_REQUIRED' });
  });

  it('TC-SIGN-039 정지 회원도 GET은 인증 헤더와 함께 그대로 성공한다(403이 아니다)', async () => {
    const { ff, repo } = setup();
    ff.route('GET /users/me/signature', respond('signature/users-me-signature__get-success.json'));
    await repo.fetchCurrent();
    expect(ff.calls[0]!.headers['authorization']).toBe('Bearer fixture-access-token-1');
  });
});
