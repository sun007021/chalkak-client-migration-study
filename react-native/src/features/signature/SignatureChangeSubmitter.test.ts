import { NetworkError, ReauthenticationRequiredError } from '../../core/http/ApiError';
import { createNetHarness, type NetHarness } from '../../core/http/__testing__/createNetHarness';
import { networkFailure } from '../../core/http/__testing__/FakeTransport';
import { fixtureBody } from '../../core/http/__testing__/loadFixture';
import { SignatureRepository } from '../../data/signature/SignatureRepository';
import { SignatureChangeSubmitter, SignatureUploadError } from './SignatureSubmitter';
import { routeFixtures, type RouteStep } from './__testing__/routes';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 5, 5]);
const OK_ROUTES: Record<string, RouteStep | RouteStep[]> = {
  'POST /users/me/signature/uploads': 'signature/users-me-signature-uploads__success',
  'PUT /__upload': 'signature/presigned-put__ok',
  'PUT /users/me/signature': 'signature/users-me-signature__put-success',
};
const signal = () => new AbortController().signal;

describe('SignatureChangeSubmitter', () => {
  let h: NetHarness;
  let submitter: SignatureChangeSubmitter;
  beforeEach(async () => {
    h = createNetHarness();
    await h.signIn();
    submitter = new SignatureChangeSubmitter(new SignatureRepository({ api: h.api }));
  });
  const confirmCalls = () => h.transport.requestsTo('PUT', '/users/me/signature');
  const summary = () => h.transport.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`);

  it('TC-SIGN-019 요청 순서는 POST uploads -> PUT presigned -> PUT /users/me/signature이고 uploadId를 확정에 쓴다', async () => {
    routeFixtures(h.transport, OK_ROUTES);
    await submitter.submit(PNG, signal());
    const ticket = fixtureBody<{ uploadId: string }>(
      'signature/users-me-signature-uploads__success',
    );
    expect(summary()).toEqual([
      'POST /api/v1/users/me/signature/uploads',
      `PUT /__upload/${ticket.uploadId}`,
      'PUT /api/v1/users/me/signature',
    ]);
    expect(h.transport.requests[1].body).toEqual(PNG);
    expect(JSON.parse(h.transport.requests[2].body as string)).toEqual({
      signatureOriginalUploadId: ticket.uploadId,
    });
  });

  it('TC-SIGN-023 presigned PUT이 실패하면 확정 호출 0건이고 SignatureUploadError', async () => {
    routeFixtures(h.transport, {
      ...OK_ROUTES,
      'PUT /__upload': 'signature/presigned-put__forbidden',
    });
    await expect(submitter.submit(PNG, signal())).rejects.toBeInstanceOf(SignatureUploadError);
    expect(
      h.transport.requests.filter((r) => new URL(r.url).pathname === '/api/v1/users/me/signature'),
    ).toHaveLength(0);
  });

  it('TC-SIGN-034 업로드 PUT의 연결 실패는 NetworkError로 끝나고 확정 호출은 0건이다', async () => {
    routeFixtures(h.transport, { ...OK_ROUTES, 'PUT /__upload': networkFailure() });
    await expect(submitter.submit(PNG, signal())).rejects.toBeInstanceOf(NetworkError);
    expect(
      h.transport.requests.every((r) => !new URL(r.url).pathname.endsWith('/me/signature')),
    ).toBe(true);
  });

  it('TC-SIGN-024 변경이 한 번 실패한 뒤 다시 시도하면 이전 uploadId를 재사용하지 않고 새 uploads 발급부터 시작한다', async () => {
    routeFixtures(h.transport, {
      ...OK_ROUTES,
      'PUT /users/me/signature': [
        'signature/users-me-signature__put-reupload-required',
        'signature/users-me-signature__put-success',
      ],
    });
    await expect(submitter.submit(PNG, signal())).rejects.toMatchObject({ status: 400 });
    await submitter.submit(PNG, signal());
    expect(h.transport.requestsTo('POST', '/users/me/signature/uploads')).toHaveLength(2);
    expect(
      h.transport.requests.filter(
        (r) => r.method === 'PUT' && new URL(r.url).pathname.startsWith('/__upload'),
      ),
    ).toHaveLength(2);
  });

  it('TC-SIGN-030 업로드 발급이 403(정지 회원)이면 이후 요청이 0건이고 재요청도 없다', async () => {
    routeFixtures(h.transport, {
      ...OK_ROUTES,
      'POST /users/me/signature/uploads': 'signature/users-me-signature-uploads__forbidden-banned',
    });
    await expect(submitter.submit(PNG, signal())).rejects.toMatchObject({ status: 403 });
    expect(h.transport.requests).toHaveLength(1);
  });

  it('TC-SIGN-031 확정 PUT이 403이면 재요청하지 않는다', async () => {
    routeFixtures(h.transport, {
      ...OK_ROUTES,
      'PUT /users/me/signature': 'signature/users-me-signature__put-forbidden-banned',
    });
    await expect(submitter.submit(PNG, signal())).rejects.toMatchObject({ status: 403 });
    expect(confirmCalls()).toHaveLength(1);
  });

  it('TC-SIGN-033 확정이 401이면 refresh 뒤 원 요청을 1회 재전송해 성공한다', async () => {
    routeFixtures(h.transport, {
      ...OK_ROUTES,
      'PUT /users/me/signature': [
        'signature/users-me-signature__put-unauthorized',
        'signature/users-me-signature__put-success',
      ],
      'POST /auth/refresh': 'auth/refresh__success',
    });
    await submitter.submit(PNG, signal());
    expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(1);
    expect(confirmCalls()).toHaveLength(2);
  });

  it('TC-SIGN-033 refresh가 REAUTHENTICATION_REQUIRED면 ReauthenticationRequiredError(로그인으로 보낼 신호)', async () => {
    routeFixtures(h.transport, {
      ...OK_ROUTES,
      'PUT /users/me/signature': 'signature/users-me-signature__put-unauthorized',
      'POST /auth/refresh': 'auth/refresh__reauthentication-required',
    });
    await expect(submitter.submit(PNG, signal())).rejects.toBeInstanceOf(
      ReauthenticationRequiredError,
    );
  });
});
