import { PresignedUploader } from '../../core/net/PresignedUploader';
import { makeApiEnv } from '../../test/apiEnv';
import { fakePng } from '../../test/FakeSignatureRasterizer';
import { jsonResponse, networkFailure } from '../../test/fakeFetch';
import type { Responder } from '../../test/fakeFetch';
import { OTHER_USER, ME, loadFixture, memberSession, tokens } from '../../test/fixtures';
import { track } from '../../test/track';
import { ChangeSignatureService } from './ChangeSignatureService';
import { SignatureRepository } from './SignatureRepository';

const UPLOAD_ID = '55555555-5555-4555-8555-555555555521';
const UPLOADS = 'POST /users/me/signature/uploads';
const PUT_FILE = `PUT /__upload/${UPLOAD_ID}`;
const CONFIRM = 'PUT /users/me/signature';
const REFRESH = 'POST /auth/refresh';

const fx = (path: string) => () => loadFixture(path).toResponse();

function setup() {
  const env = makeApiEnv(memberSession());
  const service = new ChangeSignatureService({
    repository: new SignatureRepository({ api: env.client() }),
    uploader: new PresignedUploader({ fetch: env.ff.fetch, clock: env.clock }),
    store: env.store,
    logger: env.logger,
  });
  const png = fakePng(2048);
  // FakeFetch는 먼저 등록한 경로가 우선이므로 단계별 응답은 여기서 정한다.
  const happy = (o: { uploads?: Responder[]; put?: Responder[]; confirm?: Responder[] } = {}) => {
    env.ff.route(UPLOADS, ...(o.uploads ?? [fx('signature/users-me-signature-uploads__success.json')]));
    env.ff.route(PUT_FILE, ...(o.put ?? [fx('signature/presigned-put__ok.json')]));
    env.ff.route(CONFIRM, ...(o.confirm ?? [fx('signature/users-me-signature__put-success.json')]));
  };
  const sequence = () => env.ff.calls.map((c) => `${c.method} ${c.path}`);
  const run = async (signal = new AbortController().signal) => {
    const result = track(service.submit(png, signal));
    await env.clock.advance(0);
    return result;
  };
  return { ...env, service, png, happy, sequence, run };
}

describe('ChangeSignatureService 성공 경로', () => {
  it('TC-SIGN-019 요청 순서는 POST uploads → PUT presigned → PUT /users/me/signature이다', async () => {
    const s = setup();
    s.happy();
    const result = await s.run();
    expect(result.value).toEqual({ kind: 'succeeded' });
    expect(s.sequence()).toEqual([UPLOADS, PUT_FILE, CONFIRM]);
  });

  it('TC-SIGN-021 사인 PUT은 Content-Type image/png뿐(Authorization 없음)이고 본문은 PNG 전체이다', async () => {
    const s = setup();
    s.happy();
    await s.run();
    const put = s.ff.callsTo(PUT_FILE)[0]!;
    expect(Object.keys(put.headers)).toEqual(['content-type']);
    expect(put.headers['content-type']).toBe('image/png');
    expect(put.body).toBe(s.png);
  });

  it('TC-SIGN-022 확정 바디는 발급받은 uploadId를 담은 {signatureOriginalUploadId}뿐이다', async () => {
    const s = setup();
    s.happy();
    await s.run();
    expect(JSON.parse(s.ff.callsTo(CONFIRM)[0]!.body as string)).toEqual({ signatureOriginalUploadId: UPLOAD_ID });
    expect(s.ff.callsTo(CONFIRM)[0]!.headers['authorization']).toBe('Bearer fixture-access-token-1');
  });
});

describe('ChangeSignatureService 실패 분류', () => {
  it('TC-SIGN-023 업로드 PUT이 403(S3 서명 불일치)이면 확정 호출 0건이고 generic이다', async () => {
    const s = setup();
    s.happy({ put: [fx('signature/presigned-put__forbidden.json')] });
    const result = await s.run();
    expect(result.value).toEqual({ kind: 'failed', failure: { kind: 'generic' } });
    expect(s.sequence()).toEqual([UPLOADS, PUT_FILE]);
  });

  it('TC-SIGN-024 실패 뒤 다시 시도하면 이전 uploadId를 쓰지 않고 새 uploads 발급부터 시작한다', async () => {
    const s = setup();
    const second = '55555555-5555-4555-8555-555555555599';
    s.ff.route(UPLOADS, fx('signature/users-me-signature-uploads__success.json'), () =>
      jsonResponse(200, { uploadId: second, uploadUrl: `http://localhost:4010/__upload/${second}?X-Amz-Expires=300`, expiresInSeconds: 300 }),
    );
    s.ff.route(PUT_FILE, fx('signature/presigned-put__forbidden.json'));
    s.ff.route(`PUT /__upload/${second}`, fx('signature/presigned-put__ok.json'));
    s.ff.route(CONFIRM, fx('signature/users-me-signature__put-success.json'));
    expect((await s.run()).value).toMatchObject({ kind: 'failed' });
    const retry = await s.run();
    expect(retry.value).toEqual({ kind: 'succeeded' });
    expect(s.ff.callsTo(UPLOADS)).toHaveLength(2);
    expect(JSON.parse(s.ff.callsTo(CONFIRM)[0]!.body as string)).toEqual({ signatureOriginalUploadId: second });
  });

  it('TC-SIGN-028 확정이 400 SIGNATURE_REUPLOAD_REQUIRED면 reupload이고 다음 시도는 새 uploadId부터이다', async () => {
    const s = setup();
    s.happy({ confirm: [fx('signature/users-me-signature__put-reupload-required.json'), fx('signature/users-me-signature__put-success.json')] });
    expect((await s.run()).value).toEqual({ kind: 'failed', failure: { kind: 'reupload' } });
    await s.run();
    expect(s.ff.callsTo(UPLOADS)).toHaveLength(2);
    expect(s.ff.callsTo(PUT_FILE)).toHaveLength(2);
  });

  it('TC-SIGN-029 확정이 400 BUSINESS_ERROR면 invalid다', async () => {
    const s = setup();
    s.happy({ confirm: [fx('signature/users-me-signature__put-invalid-signature.json')] });
    expect((await s.run()).value).toEqual({ kind: 'failed', failure: { kind: 'invalid' } });
  });

  it('TC-SIGN-030 업로드 발급이 403(정지 회원)이면 forbidden이고 이후 요청은 0건이며 재시도도 없다', async () => {
    const s = setup();
    s.happy({ uploads: [fx('signature/users-me-signature-uploads__forbidden-banned.json')] });
    const result = await s.run();
    await s.clock.advance(10_000);
    expect(result.value).toMatchObject({ kind: 'failed', failure: { kind: 'forbidden' } });
    expect(s.sequence()).toEqual([UPLOADS]);
  });

  it('TC-SIGN-031 확정이 403이면 forbidden이고 같은 요청을 다시 보내지 않는다', async () => {
    const s = setup();
    s.happy({ confirm: [fx('signature/users-me-signature__put-forbidden-banned.json')] });
    const result = await s.run();
    await s.clock.advance(10_000);
    expect(result.value).toMatchObject({ kind: 'failed', failure: { kind: 'forbidden' } });
    expect(s.ff.callsTo(CONFIRM)).toHaveLength(1);
  });

  it('TC-SIGN-032 확정이 404 BUSINESS_ERROR면 not_found다', async () => {
    const s = setup();
    s.happy({ confirm: [fx('signature/users-me-signature__put-upload-not-found.json')] });
    expect((await s.run()).value).toEqual({ kind: 'failed', failure: { kind: 'not_found' } });
  });

  it('TC-SIGN-033 확정이 401이면 refresh 후 원 요청을 1회 재전송해 성공하고 다시 업로드하지 않는다', async () => {
    const s = setup();
    s.happy({ confirm: [fx('signature/users-me-signature__put-unauthorized.json'), fx('signature/users-me-signature__put-success.json')] });
    s.ff.route(REFRESH, fx('auth/refresh__success.json'));
    const result = await s.run();
    expect(result.value).toEqual({ kind: 'succeeded' });
    expect(s.sequence()).toEqual([UPLOADS, PUT_FILE, CONFIRM, REFRESH, CONFIRM]);
    expect(s.ff.callsTo(CONFIRM)[1]!.headers['authorization']).toBe('Bearer fixture-access-token-2');
  });

  it('TC-SIGN-033 업로드 발급이 401이어도 같다. refresh가 REAUTHENTICATION_REQUIRED면 세션을 지우고 expired다', async () => {
    const s = setup();
    s.happy({ uploads: [fx('common/error__unauthorized-token-invalid.json')] });
    s.ff.route(REFRESH, fx('auth/refresh__reauthentication-required.json'));
    const result = await s.run();
    expect(result.value).toEqual({ kind: 'failed', failure: { kind: 'expired' } });
    expect(s.expired.count).toBe(1);
    expect(s.ff.callsTo(PUT_FILE)).toHaveLength(0);
  });

  it('TC-SIGN-034 어느 단계든 연결 실패면 network이다', async () => {
    for (const step of ['uploads', 'put', 'confirm'] as const) {
      const s = setup();
      s.happy({ [step]: [networkFailure] });
      const result = track(s.service.submit(s.png, new AbortController().signal));
      await s.clock.advance(10_000); // 멱등 요청의 백오프 재시도가 있어도 모두 소진
      expect(result.value, step).toEqual({ kind: 'failed', failure: { kind: 'network' } });
    }
  });

  it('TC-SIGN-035 업로드 발급이 500이면 0.5초, 1초 백오프로 2회 재시도(총 3회)한 뒤 generic이고 PUT·확정은 0건이다', async () => {
    const s = setup();
    s.happy({ uploads: [fx('common/error__internal-500.json')] });
    const result = track(s.service.submit(s.png, new AbortController().signal));
    await s.clock.advance(10_000);
    expect(s.ff.callsTo(UPLOADS)).toHaveLength(3);
    expect(result.value).toEqual({ kind: 'failed', failure: { kind: 'generic' } });
    expect(s.sequence().filter((c) => c !== UPLOADS)).toEqual([]);
  });

  it('TC-SIGN-035 확정이 500이어도 generic이다(PUT은 멱등이라 D-21 재시도 뒤)', async () => {
    const s = setup();
    s.happy({ confirm: [fx('signature/users-me-signature__put-internal-error.json')] });
    const result = track(s.service.submit(s.png, new AbortController().signal));
    await s.clock.advance(10_000);
    expect(result.value).toEqual({ kind: 'failed', failure: { kind: 'generic' } });
    expect(s.ff.callsTo(UPLOADS)).toHaveLength(1);
  });
});

describe('ChangeSignatureService 취소·계정 전환', () => {
  it('TC-SIGN-037 확정 호출 전에 취소하면 확정 요청 0건이고 cancelled다', async () => {
    const s = setup();
    const controller = new AbortController();
    s.happy({
      put: [
        async () => {
          await s.clock.sleep(5_000);
          return loadFixture('signature/presigned-put__ok.json').toResponse();
        },
      ],
    });
    const result = track(s.service.submit(s.png, controller.signal));
    await s.clock.advance(100);
    controller.abort();
    await s.clock.advance(10_000);
    expect(result.value).toEqual({ kind: 'cancelled' });
    expect(s.ff.callsTo(CONFIRM)).toHaveLength(0);
  });

  it('TC-SIGN-038 확정 응답을 기다리는 사이 다른 계정으로 바뀌면 결과를 버리고 cancelled다', async () => {
    const s = setup();
    s.happy({
      confirm: [
        async () => {
          await s.store.write({ userId: OTHER_USER, tokens: tokens({ accessToken: 'other-access', refreshToken: 'other-refresh' }), isGuest: false });
          return loadFixture('signature/users-me-signature__put-success.json').toResponse();
        },
      ],
    });
    const result = await s.run();
    expect(result.value).toEqual({ kind: 'cancelled' });
  });

  it('TC-SIGN-038 확정 응답을 기다리는 사이 로그아웃(세션 삭제)돼도 cancelled다', async () => {
    const s = setup();
    s.happy({
      confirm: [
        async () => {
          await s.store.clear();
          return loadFixture('signature/users-me-signature__put-success.json').toResponse();
        },
      ],
    });
    expect((await s.run()).value).toEqual({ kind: 'cancelled' });
  });

  it('같은 계정이면 중간에 토큰이 갱신돼도 결과를 그대로 낸다', async () => {
    const s = setup();
    s.happy({
      confirm: [
        async () => {
          await s.store.write({ userId: ME, tokens: tokens({ accessToken: 'fixture-access-token-2', refreshToken: 'fixture-refresh-token-2' }), isGuest: false });
          return loadFixture('signature/users-me-signature__put-success.json').toResponse();
        },
      ],
    });
    expect((await s.run()).value).toEqual({ kind: 'succeeded' });
  });
});
