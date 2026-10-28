import { CancelledError, HttpError, NetworkError } from '../../core/http/ApiError';
import { FakeSleeper } from '../../core/http/__testing__/FakeSleeper';
import { networkFailure } from '../../core/http/__testing__/FakeTransport';
import { fixtureBody } from '../../core/http/__testing__/loadFixture';
import { createAuthHarness, type AuthHarness } from '../../data/auth/__testing__/createAuthHarness';
import { SignUpRepository } from '../../data/auth/SignUpRepository';
import { SIGNUP_PENDING_RETRY } from '../../shared/constants';
import { PENDING } from '../onboarding/__testing__/createSignUpHarness';
import {
  AlreadyRegisteredUnresolvedError,
  SignUpSubmitter,
  SignatureUploadError,
  SignupPendingTimeoutError,
} from './SignatureSubmitter';
import { flush } from './__testing__/draw';
import { routeFixtures, type RouteStep } from './__testing__/routes';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 7, 7, 7]);
const OK_ROUTES: Record<string, RouteStep | RouteStep[]> = {
  'POST /auth/social-signup/signature/uploads': 'onboarding/signup-uploads__success',
  'PUT /__upload': 'onboarding/presigned-put__ok',
  'POST /auth/social-signup': 'onboarding/signup__success',
};
const PENDING_STEP = 'onboarding/signup__signature-processing-pending';
const signal = () => new AbortController().signal;

describe('SignUpSubmitter', () => {
  let h: AuthHarness;
  let sleeper: FakeSleeper;
  let submitter: SignUpSubmitter;
  const build = (manual = false) => {
    sleeper = new FakeSleeper(manual);
    submitter = new SignUpSubmitter({
      signUpRepository: new SignUpRepository({ api: h.api, authRepository: h.repository }),
      authRepository: h.repository,
      pending: PENDING,
      sleeper,
    });
  };
  const posts = (path: string) => h.transport.requestsTo('POST', path);
  beforeEach(() => {
    h = createAuthHarness();
    build();
  });

  it('TC-ONB-019 요청 순서는 uploads -> presigned PUT -> social-signup이고 발급 응답의 URL·토큰을 쓴다', async () => {
    routeFixtures(h.transport, OK_ROUTES);
    await submitter.submit(PNG, signal());

    const urls = h.transport.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`);
    const ticket = fixtureBody<{ uploadId: string; signupToken: string }>(
      'onboarding/signup-uploads__success',
    );
    expect(urls).toEqual([
      'POST /api/v1/auth/social-signup/signature/uploads',
      `PUT /__upload/${ticket.uploadId}`,
      'POST /api/v1/auth/social-signup',
    ]);
    expect(h.transport.requests[1].body).toEqual(PNG);
    expect(JSON.parse(h.transport.requests[2].body as string)).toEqual({
      signupToken: ticket.signupToken,
    });
    expect((await h.sessionStore.load()).kind).toBe('authenticated');
  });

  it.each([
    ['500', 'common/error__internal-500'],
    ['401', 'onboarding/signup-uploads__unauthorized'],
    ['403', 'onboarding/signup-uploads__forbidden-banned'],
  ])(
    'TC-ONB-019 TC-ONB-032 TC-ONB-033 업로드 발급이 %s로 실패하면 PUT·가입 확정은 0건이다',
    async (_n, fixture) => {
      routeFixtures(h.transport, {
        ...OK_ROUTES,
        'POST /auth/social-signup/signature/uploads': fixture,
      });
      await expect(submitter.submit(PNG, signal())).rejects.toBeInstanceOf(HttpError);
      expect(h.transport.requests).toHaveLength(1);
    },
  );

  it.each([
    ['만료', 'onboarding/presigned-put__expired'],
    ['Content-Type 불일치', 'onboarding/presigned-put__content-type-mismatch'],
  ])(
    'TC-ONB-040 presigned PUT이 403(%s)이면 SignatureUploadError이고 signup 호출은 0건이다',
    async (_n, fixture) => {
      routeFixtures(h.transport, { ...OK_ROUTES, 'PUT /__upload': fixture });
      await expect(submitter.submit(PNG, signal())).rejects.toBeInstanceOf(SignatureUploadError);
      expect(posts('/auth/social-signup')).toHaveLength(0);
    },
  );

  it('TC-ONB-041 presigned PUT의 연결 실패는 D-21대로 2회 재시도한 뒤 NetworkError로 끝나고 signup 호출은 0건이다', async () => {
    routeFixtures(h.transport, { ...OK_ROUTES, 'PUT /__upload': networkFailure() });
    await expect(submitter.submit(PNG, signal())).rejects.toBeInstanceOf(NetworkError);
    expect(
      h.transport.requestsTo('PUT', '/__upload/55555555-5555-4555-8555-555555555512'),
    ).toHaveLength(3);
    expect(posts('/auth/social-signup')).toHaveLength(0);
  });

  it('TC-ONB-026 PENDING이면 같은 signupToken으로 1초 뒤 다시 요청하고 uploads/PUT은 다시 부르지 않는다', async () => {
    routeFixtures(h.transport, {
      ...OK_ROUTES,
      'POST /auth/social-signup': [PENDING_STEP, 'onboarding/signup__success'],
    });
    await submitter.submit(PNG, signal());

    const signups = posts('/auth/social-signup');
    expect(signups).toHaveLength(2);
    expect(signups[0].body).toBe(signups[1].body); // 같은 signupToken
    expect(posts('/auth/social-signup/signature/uploads')).toHaveLength(1);
    expect(h.transport.requests.filter((r) => r.method === 'PUT')).toHaveLength(1);
    expect(sleeper.calls).toEqual([SIGNUP_PENDING_RETRY.intervalMs]);
  });

  it('TC-ONB-027 PENDING 2회 뒤 200이면 1초 간격 두 번 기다리고 총 signup 요청은 3회이다', async () => {
    routeFixtures(h.transport, {
      ...OK_ROUTES,
      'POST /auth/social-signup': [PENDING_STEP, PENDING_STEP, 'onboarding/signup__success'],
    });
    await submitter.submit(PNG, signal());
    expect(posts('/auth/social-signup')).toHaveLength(3);
    expect(sleeper.calls).toEqual([1000, 1000]); // 2초 시점에 성공
    expect((await h.sessionStore.load()).kind).toBe('authenticated');
  });

  it('TC-ONB-028 경계: 재시도 10번째에 성공하면 통과(총 11회, 대기 10번)', async () => {
    routeFixtures(h.transport, {
      ...OK_ROUTES,
      'POST /auth/social-signup': [...Array(10).fill(PENDING_STEP), 'onboarding/signup__success'],
    });
    await submitter.submit(PNG, signal());
    expect(posts('/auth/social-signup')).toHaveLength(1 + SIGNUP_PENDING_RETRY.maxAttempts);
    expect(sleeper.calls).toEqual(Array(10).fill(1000));
  });

  it('TC-ONB-028 PENDING이 계속되면 최초 1회 + 재시도 10회(총 11회, 10초)에서 멈추고 SignupPendingTimeoutError', async () => {
    routeFixtures(h.transport, { ...OK_ROUTES, 'POST /auth/social-signup': PENDING_STEP });
    await expect(submitter.submit(PNG, signal())).rejects.toBeInstanceOf(SignupPendingTimeoutError);
    expect(posts('/auth/social-signup')).toHaveLength(11);
    expect(sleeper.calls).toEqual(Array(10).fill(1000));
    expect((await h.sessionStore.load()).kind).not.toBe('authenticated');
  });

  it('TC-ONB-017 대기 중에는 아직 끝나지 않은 상태이고, 시간이 흘러야 다음 요청이 나간다', async () => {
    build(true);
    routeFixtures(h.transport, {
      ...OK_ROUTES,
      'POST /auth/social-signup': [PENDING_STEP, 'onboarding/signup__success'],
    });
    let done = false;
    void submitter.submit(PNG, signal()).then(() => (done = true));
    await flush();
    expect(posts('/auth/social-signup')).toHaveLength(1);
    expect(done).toBe(false);
    sleeper.release();
    await flush();
    expect(posts('/auth/social-signup')).toHaveLength(2);
    expect(done).toBe(true);
  });

  it('TC-ONB-044 PENDING 대기 중 취소되면 CancelledError로 끝나고 이후 요청이 없다', async () => {
    build(true);
    routeFixtures(h.transport, { ...OK_ROUTES, 'POST /auth/social-signup': PENDING_STEP });
    const controller = new AbortController();
    const result = submitter.submit(PNG, controller.signal);
    await flush();
    controller.abort();
    await expect(result).rejects.toBeInstanceOf(CancelledError);
    expect(posts('/auth/social-signup')).toHaveLength(1);
  });

  it('TC-ONB-030 PENDING 재시도 중 signupToken 만료로 401이면 거기서 멈추고 오류를 올린다', async () => {
    routeFixtures(h.transport, {
      ...OK_ROUTES,
      'POST /auth/social-signup': [PENDING_STEP, 'onboarding/signup__unauthorized'],
    });
    await expect(submitter.submit(PNG, signal())).rejects.toMatchObject({ status: 401 });
    expect(posts('/auth/social-signup')).toHaveLength(2);
  });

  it('TC-ONB-029 실패 뒤 다시 시도하면 새 uploads부터 시작하고 같은 idToken·rawNonce를 쓴다', async () => {
    routeFixtures(h.transport, {
      ...OK_ROUTES,
      'POST /auth/social-signup': [
        'onboarding/signup__upload-not-found',
        'onboarding/signup__success',
      ],
    });
    await expect(submitter.submit(PNG, signal())).rejects.toMatchObject({ status: 404 });
    await submitter.submit(PNG, signal());

    const uploads = posts('/auth/social-signup/signature/uploads');
    expect(uploads).toHaveLength(2);
    expect(JSON.parse(uploads[1].body as string)).toMatchObject({
      idToken: PENDING.idToken,
      rawNonce: PENDING.rawNonce,
    });
    expect(h.transport.requests.filter((r) => r.method === 'PUT')).toHaveLength(2);
  });

  it('TC-ONB-031 업로드 발급이 400(이미 가입된 계정)이면 같은 idToken·rawNonce로 social-login을 불러 LOGIN_SUCCESS면 성공으로 끝낸다', async () => {
    routeFixtures(h.transport, {
      'POST /auth/social-signup/signature/uploads': 'onboarding/signup-uploads__already-registered',
      'POST /auth/social-login': 'auth/social-login__login-success',
    });
    await submitter.submit(PNG, signal());

    const login = posts('/auth/social-login');
    expect(login).toHaveLength(1);
    expect(JSON.parse(login[0].body as string)).toEqual({
      provider: 'KAKAO',
      idToken: PENDING.idToken,
      rawNonce: PENDING.rawNonce,
    });
    expect(h.transport.requests.filter((r) => r.method === 'PUT')).toHaveLength(0);
    expect(posts('/auth/social-signup')).toHaveLength(0);
    expect((await h.sessionStore.load()).kind).toBe('authenticated');
  });

  it('TC-ONB-031 재로그인이 다시 SIGN_UP_REQUIRED면 AlreadyRegisteredUnresolvedError(일반 실패)', async () => {
    routeFixtures(h.transport, {
      'POST /auth/social-signup/signature/uploads': 'onboarding/signup-uploads__already-registered',
      'POST /auth/social-login': 'auth/social-login__sign-up-required',
    });
    await expect(submitter.submit(PNG, signal())).rejects.toBeInstanceOf(
      AlreadyRegisteredUnresolvedError,
    );
    expect((await h.sessionStore.load()).kind).not.toBe('authenticated');
  });

  it('TC-ONB-042 어느 단계든 500이면 자동 재시도 없이 실패한다', async () => {
    routeFixtures(h.transport, {
      ...OK_ROUTES,
      'POST /auth/social-signup': 'common/error__internal-500',
    });
    await expect(submitter.submit(PNG, signal())).rejects.toMatchObject({ status: 500 });
    expect(posts('/auth/social-signup')).toHaveLength(1);
    expect(sleeper.calls).toEqual([]);
  });

  it('TC-ONB-038 이미 가입된 같은 계정의 중복 호출이 200(기존 회원 결과)이면 성공과 같게 처리한다', async () => {
    routeFixtures(h.transport, OK_ROUTES);
    await submitter.submit(PNG, signal());
    await submitter.submit(PNG, signal());
    expect((await h.sessionStore.load()).kind).toBe('authenticated');
  });
});
