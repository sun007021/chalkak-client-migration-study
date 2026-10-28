import { SIGNUP_PENDING_RETRY_INTERVAL_MS, SIGNUP_PENDING_RETRY_MAX } from '../../constants';
import { UserCaches } from '../../core/auth/UserCaches';
import { PresignedUploader } from '../../core/net/PresignedUploader';
import { makeApiEnv } from '../../test/apiEnv';
import { fakePng } from '../../test/FakeSignatureRasterizer';
import { networkFailure } from '../../test/fakeFetch';
import type { Responder } from '../../test/fakeFetch';
import { ME, NOW, guestSession, loadFixture } from '../../test/fixtures';
import { track } from '../../test/track';
import { AuthApi } from '../auth/AuthApi';
import { SignupDraft } from '../auth/SignupDraft';
import { SignupRepository } from './SignupRepository';
import { SignupService } from './SignupService';

const UPLOAD_ID = '55555555-5555-4555-8555-555555555512';
const UPLOADS = 'POST /auth/social-signup/signature/uploads';
const PUT = `PUT /__upload/${UPLOAD_ID}`;
const SIGNUP = 'POST /auth/social-signup';
const LOGIN = 'POST /auth/social-login';
const credential = { idToken: 'fake-id-token-1', rawNonce: 'fake-raw-nonce-1' };

const fx = (path: string) => () => loadFixture(path).toResponse();

function setup(options: { draft?: { idToken: string; rawNonce: string } | null } = {}) {
  const env = makeApiEnv(guestSession);
  const signupDraft = new SignupDraft();
  const draft = options.draft === undefined ? credential : options.draft;
  if (draft) signupDraft.set(draft);
  const userCaches = new UserCaches();
  const cleared: number[] = [];
  userCaches.register({ clear: () => void cleared.push(env.store.writes.length) }); // 비운 시점의 저장 횟수
  const service = new SignupService({
    repository: new SignupRepository({ api: env.client(), clock: env.clock }),
    uploader: new PresignedUploader({ fetch: env.ff.fetch, clock: env.clock }),
    authApi: new AuthApi({ api: env.client(), clock: env.clock }),
    signupDraft,
    store: env.store,
    userCaches,
    clock: env.clock,
    logger: env.logger,
  });
  const png = fakePng(1024);
  // FakeFetch는 먼저 등록한 경로가 우선이므로 단계별 응답은 여기서 덮어쓴다.
  const happy = (overrides: { uploads?: Responder[]; put?: Responder[]; signup?: Responder[] } = {}) => {
    env.ff.route(UPLOADS, ...(overrides.uploads ?? [fx('onboarding/signup-uploads__success.json')]));
    env.ff.route(PUT, ...(overrides.put ?? [fx('onboarding/presigned-put__ok.json')]));
    env.ff.route(SIGNUP, ...(overrides.signup ?? [fx('onboarding/signup__success.json')]));
  };
  const sequence = () => env.ff.calls.map((c) => `${c.method} ${c.path}`);
  const run = async (signal = new AbortController().signal) => {
    const result = track(service.submit(png, signal));
    await env.clock.advance(0);
    return result;
  };
  return { ...env, service, signupDraft, png, happy, sequence, run, cleared };
}

describe('SignupService 성공 경로', () => {
  it('TC-ONB-019 요청 순서는 uploads → PUT presigned → signup이다', async () => {
    const s = setup();
    s.happy();
    const result = await s.run();
    expect(result.value).toEqual({ kind: 'succeeded' });
    expect(s.sequence()).toEqual([UPLOADS, PUT, SIGNUP]);
  });

  it('TC-ONB-020 업로드 발급은 SignupDraft의 같은 idToken·rawNonce를 쓴다', async () => {
    const s = setup({ draft: { idToken: 'tok-9', rawNonce: 'nonce-9' } });
    s.happy();
    await s.run();
    expect(JSON.parse(s.ff.callsTo(UPLOADS)[0]!.body as string)).toEqual({ provider: 'KAKAO', idToken: 'tok-9', rawNonce: 'nonce-9' });
  });

  it('TC-ONB-022 사인 PNG PUT은 Content-Type image/png뿐(Authorization 없음)이고 본문은 PNG 전체이다', async () => {
    const s = setup();
    s.happy();
    await s.run();
    const put = s.ff.callsTo(PUT)[0]!;
    expect(Object.keys(put.headers)).toEqual(['content-type']);
    expect(put.headers['content-type']).toBe('image/png');
    expect(put.body).toBe(s.png);
    expect(put.url).toBe((loadFixture('onboarding/signup-uploads__success.json').json as { uploadUrl: string }).uploadUrl);
  });

  it('TC-ONB-023 가입 확정 바디는 발급 응답의 signupToken뿐이다', async () => {
    const s = setup();
    s.happy();
    await s.run();
    expect(JSON.parse(s.ff.callsTo(SIGNUP)[0]!.body as string)).toEqual({ signupToken: 'fixture-signup-token-1' });
  });

  it('TC-ONB-024 TC-ONB-025 200이면 이전 사용자 캐시를 비운 뒤 토큰 4종과 userId를 저장하고 가입 컨텍스트를 폐기하며 social-login은 부르지 않는다', async () => {
    const s = setup();
    s.happy();
    const result = await s.run();
    expect(result.value).toEqual({ kind: 'succeeded' });
    const saved = await s.store.read();
    expect(saved.userId).toBe(ME);
    expect(saved.isGuest).toBe(false);
    expect(saved.tokens).toEqual({
      accessToken: 'fixture-access-token-1',
      accessTokenExpiresAt: NOW + 900_000,
      refreshToken: 'fixture-refresh-token-1',
      refreshTokenExpiresAt: NOW + 2_592_000_000,
    });
    expect(s.cleared).toEqual([0]); // 저장(0번째 write) 전에 비웠다
    expect(s.signupDraft.get()).toBeNull();
    expect(s.ff.callsTo(LOGIN)).toHaveLength(0);
  });

  it('TC-ONB-038 이미 가입된 같은 계정의 중복 호출이 200(기존 회원 결과)이어도 성공과 같게 처리한다', async () => {
    const s = setup();
    s.happy({ signup: [fx('onboarding/signup__success.json')] }); // 기존 회원 결과도 같은 모양의 200
    expect((await s.run()).value).toEqual({ kind: 'succeeded' });
    expect((await s.store.read()).userId).toBe(ME);
  });
});

describe('SignupService PENDING 재시도', () => {
  const pending = fx('onboarding/signup__signature-processing-pending.json');
  const ok = fx('onboarding/signup__success.json');

  it('TC-ONB-026 첫 확정이 PENDING이면 같은 signupToken으로 1초 후 다시 요청하고 uploads·PUT은 다시 부르지 않는다', async () => {
    const s = setup();
    s.happy({ signup: [pending, ok] });
    const result = await s.run();
    expect(result.state).toBe('pending');
    expect(s.ff.callsTo(SIGNUP)).toHaveLength(1);
    await s.clock.advance(SIGNUP_PENDING_RETRY_INTERVAL_MS - 1);
    expect(s.ff.callsTo(SIGNUP)).toHaveLength(1);
    await s.clock.advance(1);
    expect(s.ff.callsTo(SIGNUP)).toHaveLength(2);
    expect(result.value).toEqual({ kind: 'succeeded' });
    expect(s.ff.callsTo(UPLOADS)).toHaveLength(1);
    expect(s.ff.callsTo(PUT)).toHaveLength(1);
    const tokens = s.ff.callsTo(SIGNUP).map((c) => (JSON.parse(c.body as string) as { signupToken: string }).signupToken);
    expect(tokens).toEqual(['fixture-signup-token-1', 'fixture-signup-token-1']);
  });

  it('TC-ONB-027 PENDING이 2회 뒤 200이면 2초 시점에 성공하고 총 signup 요청은 3회이다', async () => {
    const s = setup();
    s.happy({ signup: [pending, pending, ok] });
    const result = await s.run();
    await s.clock.advance(1_999);
    expect(result.state).toBe('pending');
    await s.clock.advance(1);
    expect(result.value).toEqual({ kind: 'succeeded' });
    expect(s.ff.callsTo(SIGNUP)).toHaveLength(3);
  });

  it('TC-ONB-028 PENDING이 계속되면 최초 1회 + 재시도 10회(총 11회, 10초)까지 보내고 소진하면 timeout이다', async () => {
    expect(SIGNUP_PENDING_RETRY_MAX).toBe(10);
    const s = setup();
    s.happy({ signup: [pending] });
    const result = await s.run();
    await s.clock.advance(9 * SIGNUP_PENDING_RETRY_INTERVAL_MS); // 9번째 재시도 시점
    expect(s.ff.callsTo(SIGNUP)).toHaveLength(10);
    expect(result.state).toBe('pending');
    await s.clock.advance(SIGNUP_PENDING_RETRY_INTERVAL_MS - 1);
    expect(s.ff.callsTo(SIGNUP)).toHaveLength(10);
    await s.clock.advance(1); // 10번째 재시도 시점
    expect(s.ff.callsTo(SIGNUP)).toHaveLength(11);
    expect(result.value).toEqual({ kind: 'failed', failure: { kind: 'timeout' } });
    await s.clock.advance(30_000);
    expect(s.ff.callsTo(SIGNUP)).toHaveLength(11);
    expect(s.ff.callsTo(UPLOADS)).toHaveLength(1);
    expect(s.ff.callsTo(PUT)).toHaveLength(1);
    expect((await s.store.read()).tokens).toBeNull();
  });

  it('TC-ONB-029 타임아웃 뒤 다시 시도하면 새 uploads부터 시작한다(같은 idToken·rawNonce 재사용) [결정 필요]', async () => {
    const s = setup();
    s.happy({ signup: [pending] });
    await s.run();
    await s.clock.advance(10_000);
    const second = track(s.service.submit(s.png, new AbortController().signal));
    await s.clock.advance(0);
    expect(second.state).toBe('pending');
    expect(s.ff.callsTo(UPLOADS)).toHaveLength(2);
    expect(s.ff.callsTo(PUT)).toHaveLength(2);
    const bodies = s.ff.callsTo(UPLOADS).map((c) => JSON.parse(c.body as string) as unknown);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[0]).toEqual({ provider: 'KAKAO', idToken: credential.idToken, rawNonce: credential.rawNonce });
  });

  it('TC-ONB-030 PENDING 재시도 중 signupToken 만료(401)면 expired이고 가입 컨텍스트를 폐기하며 더 재시도하지 않는다', async () => {
    const s = setup();
    s.happy({ signup: [pending, fx('onboarding/signup__unauthorized.json')] });
    const result = await s.run();
    await s.clock.advance(1_000);
    expect(result.value).toEqual({ kind: 'failed', failure: { kind: 'expired' } });
    expect(s.signupDraft.get()).toBeNull();
    await s.clock.advance(5_000);
    expect(s.ff.callsTo(SIGNUP)).toHaveLength(2);
  });

  it('TC-ONB-044 PENDING 대기 중 취소하면 더 요청하지 않고 cancelled이며 세션을 저장하지 않는다', async () => {
    const s = setup();
    s.happy({ signup: [pending] });
    const controller = new AbortController();
    const result = await s.run(controller.signal);
    controller.abort();
    await s.clock.advance(20_000);
    expect(result.value).toEqual({ kind: 'cancelled' });
    expect(s.ff.callsTo(SIGNUP)).toHaveLength(1);
    expect(s.store.writes).toHaveLength(0);
  });
});

describe('SignupService 오류 분기', () => {
  it('TC-ONB-019 업로드 발급이 실패하면 PUT·signup 호출은 0건이다', async () => {
    const s = setup();
    s.ff.route(UPLOADS, fx('common/error__internal-500.json'));
    s.ff.route(PUT, fx('onboarding/presigned-put__ok.json'));
    s.ff.route(SIGNUP, fx('onboarding/signup__success.json'));
    const result = await s.run();
    expect(result.value).toEqual({ kind: 'failed', failure: { kind: 'generic' } });
    expect(s.sequence()).toEqual([UPLOADS]);
  });

  it('TC-ONB-031 업로드 발급이 400(이미 가입된 계정)이면 같은 idToken·rawNonce로 social-login을 부르고 LOGIN_SUCCESS면 세션을 저장해 성공한다', async () => {
    const s = setup();
    s.ff.route(UPLOADS, fx('onboarding/signup-uploads__already-registered.json'));
    s.ff.route(LOGIN, fx('auth/social-login__login-success.json'));
    const result = await s.run();
    expect(result.value).toEqual({ kind: 'succeeded' });
    expect(s.sequence()).toEqual([UPLOADS, LOGIN]);
    expect(JSON.parse(s.ff.callsTo(LOGIN)[0]!.body as string)).toEqual({ provider: 'KAKAO', idToken: credential.idToken, rawNonce: credential.rawNonce });
    const saved = await s.store.read();
    expect(saved).toMatchObject({ userId: ME, isGuest: false });
    expect(saved.tokens?.accessToken).toBe('fixture-access-token-1');
    expect(s.signupDraft.get()).toBeNull();
  });

  it('TC-ONB-031 REQ-ONB-022 재호출도 SIGN_UP_REQUIRED면 generic이다(message가 아니라 호출 API로 분기, D-02)', async () => {
    const s = setup();
    s.ff.route(UPLOADS, fx('onboarding/signup-uploads__already-registered.json'));
    s.ff.route(LOGIN, fx('auth/social-login__sign-up-required.json'));
    const result = await s.run();
    expect(result.value).toEqual({ kind: 'failed', failure: { kind: 'generic' } });
    expect((await s.store.read()).tokens).toBeNull();
  });

  it('TC-ONB-031 재호출이 네트워크 오류면 network, 403이면 forbidden(서버 message)이다', async () => {
    const a = setup();
    a.ff.route(UPLOADS, fx('onboarding/signup-uploads__already-registered.json'));
    a.ff.route(LOGIN, networkFailure);
    expect((await a.run()).value).toEqual({ kind: 'failed', failure: { kind: 'network' } });

    const b = setup();
    b.ff.route(UPLOADS, fx('onboarding/signup-uploads__already-registered.json'));
    b.ff.route(LOGIN, fx('common/error__forbidden-banned.json'));
    const result = await b.run();
    expect(result.value).toMatchObject({ kind: 'failed', failure: { kind: 'forbidden' } });
  });

  it('TC-ONB-032 업로드 발급이 403(차단)이면 forbidden과 서버 message를 돌려주고 이후 요청은 0건이다', async () => {
    const s = setup();
    s.ff.route(UPLOADS, fx('onboarding/signup-uploads__forbidden-banned.json'));
    const result = await s.run();
    const body = loadFixture('onboarding/signup-uploads__forbidden-banned.json').json as { message: string };
    expect(result.value).toEqual({ kind: 'failed', failure: { kind: 'forbidden', serverMessage: body.message } });
    expect(s.sequence()).toEqual([UPLOADS]);
  });

  it('TC-ONB-033 업로드 발급이 401이면 expired이고 가입 컨텍스트를 폐기한다', async () => {
    const s = setup();
    s.ff.route(UPLOADS, fx('onboarding/signup-uploads__unauthorized.json'));
    const result = await s.run();
    expect(result.value).toEqual({ kind: 'failed', failure: { kind: 'expired' } });
    expect(s.signupDraft.get()).toBeNull();
    expect(s.sequence()).toEqual([UPLOADS]); // 401이어도 /auth/*라 갱신·재전송 없음
  });

  it('REQ-ONB-023 가입 컨텍스트(idToken·rawNonce)가 없으면 요청 0건으로 expired다(새로고침 등)', async () => {
    const s = setup({ draft: null });
    s.happy();
    const result = await s.run();
    expect(result.value).toEqual({ kind: 'failed', failure: { kind: 'expired' } });
    expect(s.ff.calls).toHaveLength(0);
  });

  it('TC-ONB-034 signup이 400 "이미 사용된 회원가입 토큰"이어도 D-02에 따라 message로 가르지 않고 invalid이며, 다음 시도는 새 uploads부터이다', async () => {
    const s = setup();
    s.happy({ signup: [fx('onboarding/signup__already-used-token.json'), fx('onboarding/signup__success.json')] });
    expect((await s.run()).value).toEqual({ kind: 'failed', failure: { kind: 'invalid' } });
    const again = await s.run();
    expect(again.value).toEqual({ kind: 'succeeded' });
    expect(s.sequence()).toEqual([UPLOADS, PUT, SIGNUP, UPLOADS, PUT, SIGNUP]);
  });

  it('TC-ONB-035 signup이 400 "사용할 수 없는 사인 이미지"면 invalid다', async () => {
    const s = setup();
    s.happy({ signup: [fx('onboarding/signup__invalid-signature.json')] });
    expect((await s.run()).value).toEqual({ kind: 'failed', failure: { kind: 'invalid' } });
  });

  it('TC-ONB-036 signup이 404(업로드 없음)면 reupload이고 다음 시도는 새 uploads부터이다', async () => {
    const s = setup();
    s.happy({ signup: [fx('onboarding/signup__upload-not-found.json'), fx('onboarding/signup__success.json')] });
    expect((await s.run()).value).toEqual({ kind: 'failed', failure: { kind: 'reupload' } });
    await s.run();
    expect(s.ff.callsTo(UPLOADS)).toHaveLength(2);
  });

  it('TC-ONB-037 signup이 403이면 forbidden과 서버 message를 돌려준다', async () => {
    const s = setup();
    s.happy({ signup: [fx('onboarding/signup__forbidden-banned.json')] });
    const body = loadFixture('onboarding/signup__forbidden-banned.json').json as { message: string };
    expect((await s.run()).value).toEqual({ kind: 'failed', failure: { kind: 'forbidden', serverMessage: body.message } });
  });

  it('TC-ONB-039 signup이 탈퇴 회원이라며 400 "이미 가입된 소셜 계정"이어도 D-02에 따라 invalid다 [확인 필요 5]', async () => {
    const s = setup();
    s.happy({ signup: [fx('onboarding/signup__already-registered-withdrawn.json')] });
    expect((await s.run()).value).toEqual({ kind: 'failed', failure: { kind: 'invalid' } });
    expect(s.ff.callsTo(LOGIN)).toHaveLength(0); // 확정 단계의 400에서는 social-login을 다시 부르지 않는다
  });

  it.each([
    ['TC-ONB-040 만료', 'onboarding/presigned-put__expired.json'],
    ['TC-ONB-040 Content-Type 불일치(서명 불일치)', 'onboarding/presigned-put__content-type-mismatch.json'],
  ])('%s: 사인 PUT이 403이면 signup 호출 0건이고 generic이며 다음 시도는 새 uploads부터이다', async (_name, fixture) => {
    const s = setup();
    s.ff.route(UPLOADS, fx('onboarding/signup-uploads__success.json'));
    s.ff.route(PUT, fx(fixture), fx('onboarding/presigned-put__ok.json'));
    s.ff.route(SIGNUP, fx('onboarding/signup__success.json'));
    const first = await s.run();
    expect(first.value).toEqual({ kind: 'failed', failure: { kind: 'generic' } });
    expect(s.ff.callsTo(SIGNUP)).toHaveLength(0);
    await s.run();
    expect(s.ff.callsTo(UPLOADS)).toHaveLength(2);
    expect(s.ff.callsTo(SIGNUP)).toHaveLength(1);
  });

  it('TC-ONB-041 어느 단계든 연결 실패면 network이고, 다시 시도할 수 있다', async () => {
    for (const failing of [UPLOADS, PUT, SIGNUP]) {
      const s = setup();
      s.happy({ [failing === UPLOADS ? 'uploads' : failing === PUT ? 'put' : 'signup']: [networkFailure] });
      expect((await s.run()).value, failing).toEqual({ kind: 'failed', failure: { kind: 'network' } });
    }
  });

  it('TC-ONB-042 어느 단계든 500이면 generic이고 가입 단계의 POST는 자동 재시도하지 않는다', async () => {
    const uploads = setup();
    uploads.ff.route(UPLOADS, fx('common/error__internal-500.json'));
    const a = await uploads.run();
    await uploads.clock.advance(10_000);
    expect(a.value).toEqual({ kind: 'failed', failure: { kind: 'generic' } });
    expect(uploads.ff.callsTo(UPLOADS)).toHaveLength(1);

    const confirm = setup();
    confirm.happy({ signup: [fx('common/error__internal-500.json')] });
    const b = await confirm.run();
    await confirm.clock.advance(10_000);
    expect(b.value).toEqual({ kind: 'failed', failure: { kind: 'generic' } });
    expect(confirm.ff.callsTo(SIGNUP)).toHaveLength(1);
  });

  it('TC-ONB-046 submit마다 그 시점의 SignupDraft 쌍을 쓴다 — 새 로그인 시도가 쌍을 바꾸면 새 쌍으로 업로드를 발급한다', async () => {
    const s = setup();
    s.happy({ signup: [fx('onboarding/signup__invalid-signature.json'), fx('onboarding/signup__success.json')] });
    await s.run();
    s.signupDraft.set({ idToken: 'fake-id-token-2', rawNonce: 'fake-raw-nonce-2' });
    await s.run();
    const bodies = s.ff.callsTo(UPLOADS).map((c) => JSON.parse(c.body as string) as { idToken: string; rawNonce: string });
    expect(bodies.map((b) => [b.idToken, b.rawNonce])).toEqual([
      ['fake-id-token-1', 'fake-raw-nonce-1'],
      ['fake-id-token-2', 'fake-raw-nonce-2'],
    ]);
  });
});

describe('SignupService 취소 (TC-ONB-044)', () => {
  it('확정 응답을 기다리는 중 취소하면 cancelled이고 세션이 저장되지 않으며 가입 컨텍스트도 폐기하지 않는다', async () => {
    const s = setup();
    const controller = new AbortController();
    s.happy({
      signup: [
        async () => {
          await s.clock.sleep(5_000);
          return loadFixture('onboarding/signup__success.json').toResponse();
        },
      ],
    });
    const result = track(s.service.submit(s.png, controller.signal));
    await s.clock.advance(100);
    controller.abort();
    await s.clock.advance(10_000);
    expect(result.value).toEqual({ kind: 'cancelled' });
    expect(s.store.writes).toHaveLength(0);
    expect(s.signupDraft.get()).toEqual(credential);
  });

  it('업로드 발급 중 취소해도 이후 PUT·signup을 부르지 않는다', async () => {
    const s = setup();
    const controller = new AbortController();
    s.happy({
      uploads: [
        async () => {
          await s.clock.sleep(5_000);
          return loadFixture('onboarding/signup-uploads__success.json').toResponse();
        },
      ],
    });
    const result = track(s.service.submit(s.png, controller.signal));
    await s.clock.advance(100);
    controller.abort();
    await s.clock.advance(10_000);
    expect(result.value).toEqual({ kind: 'cancelled' });
    expect(s.sequence()).toEqual([UPLOADS]);
  });

  it('이미 취소된 signal로 시작하면 요청을 보내지 않는다', async () => {
    const s = setup();
    s.happy();
    const controller = new AbortController();
    controller.abort();
    const result = await s.run(controller.signal);
    expect(result.value).toEqual({ kind: 'cancelled' });
    expect(s.ff.calls).toHaveLength(0);
  });
});
