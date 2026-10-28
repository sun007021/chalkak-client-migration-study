import { HttpError } from '../../core/http/ApiError';
import { createNetHarness, type NetHarness } from '../../core/http/__testing__/createNetHarness';
import { fixtureBody } from '../../core/http/__testing__/loadFixture';
import { routeFixtures } from '../../features/signature/__testing__/routes';
import { SIGNATURE_CONTENT_TYPE } from '../../shared/constants';
import { SignatureRepository } from './SignatureRepository';

describe('SignatureRepository', () => {
  let h: NetHarness;
  let repository: SignatureRepository;
  beforeEach(async () => {
    h = createNetHarness();
    await h.signIn();
    repository = new SignatureRepository({ api: h.api });
  });

  it('TC-SIGN-020 업로드 발급: uploadId·uploadUrl·expiresInSeconds만 읽고 contentType/maxBytes가 없어도 오류가 아니다', async () => {
    routeFixtures(h.transport, {
      'POST /users/me/signature/uploads': 'signature/users-me-signature-uploads__success',
    });
    const ticket = await repository.requestUpload();
    const fixture = fixtureBody<Record<string, unknown>>(
      'signature/users-me-signature-uploads__success',
    );
    expect(ticket).toEqual({
      uploadId: fixture.uploadId,
      uploadUrl: fixture.uploadUrl,
      expiresInSeconds: fixture.expiresInSeconds,
    });
    expect(fixture).not.toHaveProperty('contentType');
    const [request] = h.transport.requests;
    expect(request.method).toBe('POST');
    expect(request.body).toBeUndefined(); // 본문 없음
    expect(request.headers.Authorization).toBe('Bearer access-1');
  });

  it('TC-SIGN-021 presigned PUT: Authorization 없이 Content-Type image/png, 본문은 PNG 바이트 전체', async () => {
    routeFixtures(h.transport, { 'PUT /__upload': 'signature/presigned-put__ok' });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    await repository.uploadPng('http://localhost:4010/__upload/abc?X-Amz-Expires=300', png);

    const [request] = h.transport.requests;
    expect(request.method).toBe('PUT');
    expect(request.url).toBe('http://localhost:4010/__upload/abc?X-Amz-Expires=300');
    expect(request.headers['Content-Type']).toBe(SIGNATURE_CONTENT_TYPE);
    expect(request.headers['Content-Type']).toBe('image/png');
    expect(request.headers).not.toHaveProperty('Authorization');
    expect(request.body).toEqual(png);
  });

  it('TC-SIGN-022 변경 확정: 바디는 {signatureOriginalUploadId}만이다', async () => {
    routeFixtures(h.transport, {
      'PUT /users/me/signature': 'signature/users-me-signature__put-success',
    });
    await repository.confirmChange('55555555-5555-4555-8555-555555555521');
    const [request] = h.transport.requests;
    expect(request.method).toBe('PUT');
    expect(new URL(request.url).pathname).toBe('/api/v1/users/me/signature');
    expect(JSON.parse(request.body as string)).toEqual({
      signatureOriginalUploadId: '55555555-5555-4555-8555-555555555521',
    });
  });

  it('TC-SIGN-026 getCurrent: 썸네일이 있으면 썸네일, null이면 원본', async () => {
    routeFixtures(h.transport, {
      'GET /users/me/signature': 'signature/users-me-signature__get-success',
    });
    const withThumb = fixtureBody<Record<string, string>>(
      'signature/users-me-signature__get-success',
    );
    expect(await repository.getCurrent()).toEqual({
      imageUrl: withThumb.signatureThumbnailImageUrl,
    });

    routeFixtures(h.transport, {
      'GET /users/me/signature': 'signature/users-me-signature__get-thumbnail-null',
    });
    const noThumb = fixtureBody<Record<string, string>>(
      'signature/users-me-signature__get-thumbnail-null',
    );
    expect(await repository.getCurrent()).toEqual({ imageUrl: noThumb.signatureOriginalImageUrl });
  });

  it('TC-SIGN-040 getCurrent: 400 SIGNATURE_REGISTRATION_REQUIRED는 null(오류가 아님)', async () => {
    routeFixtures(h.transport, {
      'GET /users/me/signature': 'signature/users-me-signature__get-registration-required',
    });
    expect(await repository.getCurrent()).toBeNull();
  });

  it('REQ-SIGN-016 getCurrent: 다른 오류(500·401)는 그대로 던진다', async () => {
    routeFixtures(h.transport, {
      'GET /users/me/signature': 'signature/users-me-signature__get-internal-error',
    });
    await expect(repository.getCurrent()).rejects.toBeInstanceOf(HttpError);
  });

  it('TC-SIGN-035 업로드 발급은 멱등으로 취급해 500이면 0.5초, 1초 백오프로 최대 2회 재시도한 뒤 실패한다', async () => {
    routeFixtures(h.transport, {
      'POST /users/me/signature/uploads': 'signature/users-me-signature__put-internal-error',
    });
    await expect(repository.requestUpload()).rejects.toBeInstanceOf(HttpError);
    expect(h.transport.requests).toHaveLength(3);
    expect(h.sleeper.calls).toEqual([500, 1000]);
  });

  it('TC-SIGN-031 확정 PUT이 403이면 재요청하지 않는다', async () => {
    routeFixtures(h.transport, {
      'PUT /users/me/signature': 'signature/users-me-signature__put-forbidden-banned',
    });
    await expect(repository.confirmChange('id')).rejects.toMatchObject({ status: 403 });
    expect(h.transport.requests).toHaveLength(1);
  });

  it('TC-SIGN-028 확정 PUT의 400 SIGNATURE_REUPLOAD_REQUIRED는 errorCode로 구분되어 던져진다', async () => {
    h.transport.script({
      status: 400,
      headers: { 'content-type': 'application/json' },
      bodyText: JSON.stringify({ errorCode: 'SIGNATURE_REUPLOAD_REQUIRED', message: 'x' }),
    });
    await expect(repository.confirmChange('id')).rejects.toMatchObject({
      status: 400,
      errorCode: 'SIGNATURE_REUPLOAD_REQUIRED',
    });
  });
});
