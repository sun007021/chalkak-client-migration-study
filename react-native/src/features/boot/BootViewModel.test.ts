import { deferred } from '../../core/http/__testing__/FakeTransport';
import { advanceTime } from '../../core/time/__testing__/advanceTime';
import { createBootHarness } from './__testing__/createBootHarness';

const flush = async () => {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('BootViewModel 목적지', () => {
  it('TC-BOOT-001 TC-BOOT-014 세션이 없으면 프리로드를 기다리지 않고 로그인으로 간다(홈 프리로드 0건)', async () => {
    const h = createBootHarness();
    h.preloader.gate = new Promise(() => undefined);
    expect(h.viewModel.getSnapshot().phase).toBe('splash');

    await h.viewModel.start();

    expect(h.viewModel.getSnapshot()).toMatchObject({ phase: 'login', mode: null });
    expect(h.preloader.calls).toEqual([]);
  });

  it('TC-BOOT-002 인증 세션이면 메인(회원)으로 가고 푸시 기기 등록을 시작한다', async () => {
    const h = createBootHarness();
    await h.signIn();
    await h.viewModel.start();
    expect(h.viewModel.getSnapshot()).toMatchObject({ phase: 'main', mode: 'member' });
    expect(h.preloader.calls).toEqual(['member']);
    expect(h.push.registerCalls).toBe(1);
  });

  it('TC-BOOT-002 푸시 등록이 실패해도 메인으로 간다', async () => {
    const h = createBootHarness();
    await h.signIn();
    h.push.failRegister = true;
    await h.viewModel.start();
    expect(h.viewModel.getSnapshot().phase).toBe('main');
  });

  it('TC-BOOT-003 TC-BOOT-013 게스트면 메인(게스트)으로 가고 공개 데이터만 프리로드하며 푸시 등록은 없다', async () => {
    const h = createBootHarness();
    await h.sessionStore.enterGuest();
    await h.viewModel.start();
    expect(h.viewModel.getSnapshot()).toMatchObject({ phase: 'main', mode: 'guest' });
    expect(h.preloader.calls).toEqual(['guest']);
    expect(h.push.registerCalls).toBe(0);
    expect(h.transport.requests).toHaveLength(0);
  });

  it('TC-BOOT-004 refresh token이 만료된 세션이면 로그인이다', async () => {
    const h = createBootHarness();
    await h.signIn({ refreshTokenExpiresAt: new Date(h.clock.now().getTime() - 1) });
    await h.viewModel.start();
    expect(h.viewModel.getSnapshot().phase).toBe('login');
  });

  it('TC-BOOT-009 access token만 만료돼도 로그인 화면을 거치지 않고 메인으로 간다', async () => {
    const h = createBootHarness();
    await h.signIn({ accessTokenExpiresAt: new Date(h.clock.now().getTime() - 1000) });
    await h.viewModel.start();
    expect(h.viewModel.getSnapshot()).toMatchObject({ phase: 'main', mode: 'member' });
  });
});

describe('BootViewModel 스플래시 시간', () => {
  async function startWithPendingPreload() {
    const h = createBootHarness();
    await h.signIn();
    const gate = deferred<void>();
    h.preloader.gate = gate.promise;
    const started = h.viewModel.start();
    await flush();
    return { h, gate, started };
  }

  it('TC-BOOT-010 프리로드가 100ms에 끝나면 100ms에 해제되고 700ms를 기다리지 않는다', async () => {
    const { h, gate, started } = await startWithPendingPreload();
    advanceTime(h.clock, 99);
    await flush();
    expect(h.viewModel.getSnapshot().phase).toBe('splash');
    advanceTime(h.clock, 1);
    gate.resolve();
    await started;
    expect(h.viewModel.getSnapshot().phase).toBe('main');
  });

  it('TC-BOOT-011 프리로드가 끝나지 않으면 699ms까지 유지하고 700ms에 해제한다', async () => {
    const { h, started } = await startWithPendingPreload();
    advanceTime(h.clock, 699);
    await flush();
    expect(h.viewModel.getSnapshot().phase).toBe('splash');
    advanceTime(h.clock, 1);
    await flush();
    expect(h.viewModel.getSnapshot()).toMatchObject({ phase: 'main', mode: 'member' });
    await started;
  });

  it('TC-BOOT-011 701ms 시점에도 main이다', async () => {
    const { h, started } = await startWithPendingPreload();
    advanceTime(h.clock, 701);
    await flush();
    expect(h.viewModel.getSnapshot().phase).toBe('main');
    await started;
  });

  it('TC-BOOT-012 프리로드가 오류로 끝나면 즉시 스플래시를 해제하고 메인으로 연다(오류 표시는 홈 몫)', async () => {
    const h = createBootHarness();
    await h.signIn();
    h.preloader.failWith = new Error('popular failed');
    await h.viewModel.start();
    expect(h.viewModel.getSnapshot()).toMatchObject({ phase: 'main', mode: 'member' });
  });

  it('TC-BOOT-013 게스트도 상한은 700ms로 같다', async () => {
    const h = createBootHarness();
    await h.sessionStore.enterGuest();
    h.preloader.gate = new Promise(() => undefined);
    void h.viewModel.start();
    await flush();
    advanceTime(h.clock, 699);
    await flush();
    expect(h.viewModel.getSnapshot().phase).toBe('splash');
    advanceTime(h.clock, 1);
    await flush();
    expect(h.viewModel.getSnapshot()).toMatchObject({ phase: 'main', mode: 'guest' });
  });
});

describe('BootViewModel 강제 업데이트 게이트', () => {
  it('REQ-BOOT-002 업데이트 확인이 끝나기 전에는 스플래시를 유지하고 세션도 읽지 않는다', async () => {
    const h = createBootHarness();
    await h.signIn();
    const gate = deferred<void>();
    h.checker.gate = gate.promise;
    const started = h.viewModel.start();
    await flush();
    expect(h.viewModel.getSnapshot().phase).toBe('splash');
    expect(h.preloader.calls).toEqual([]);
    gate.resolve();
    await started;
    expect(h.viewModel.getSnapshot().phase).toBe('main');
  });

  it('TC-BOOT-016 TC-BOOT-034 강제 업데이트면 update-required에서 멈추고 푸시 등록·홈 프리로드·세션 읽기가 없다', async () => {
    const h = createBootHarness({ results: ['update-required'] });
    await h.signIn();
    const writes = h.storage.writes.length;
    await h.viewModel.start();

    expect(h.viewModel.getSnapshot()).toMatchObject({ phase: 'update-required', mode: null });
    expect(h.push.registerCalls).toBe(0);
    expect(h.preloader.calls).toEqual([]);
    expect(h.storage.writes).toHaveLength(writes);
  });

  it('TC-BOOT-016 update-required에서는 로그인·메인 전환 요청도 무시한다', async () => {
    const h = createBootHarness({ results: ['update-required'] });
    await h.viewModel.start();
    h.viewModel.toMain('member');
    h.viewModel.toLogin();
    expect(h.viewModel.getSnapshot().phase).toBe('update-required');
  });

  it('TC-BOOT-032 설정으로 꺼져 있으면 조회 없이 통과해 다음 단계로 간다', async () => {
    const h = createBootHarness({ updateEnabled: false, results: ['update-required'] });
    await h.viewModel.start();
    expect(h.checker.calls).toBe(0);
    expect(h.viewModel.getSnapshot().phase).toBe('login');
  });

  it('TC-BOOT-023 조회 실패는 통과해 인증 게이트로 간다', async () => {
    const h = createBootHarness({ results: ['unavailable'] });
    await h.viewModel.start();
    expect(h.viewModel.getSnapshot().phase).toBe('login');
  });

  it('TC-BOOT-027 앱이 다시 활성화됐을 때 새로 강제 대상이면 메인 위에서도 update-required가 된다', async () => {
    const h = createBootHarness({ results: ['up-to-date', 'update-required'] });
    await h.signIn();
    await h.viewModel.start();
    expect(h.viewModel.getSnapshot().phase).toBe('main');
    await h.viewModel.onAppActive();
    expect(h.viewModel.getSnapshot().phase).toBe('update-required');
  });

  it('TC-BOOT-025 오프라인으로 통과한 뒤 온라인 전환 재조회에서 강제 대상이면 다이얼로그가 뜬다', async () => {
    const h = createBootHarness({ results: ['unavailable', 'update-required'] });
    await h.viewModel.start();
    expect(h.viewModel.getSnapshot().phase).toBe('login');
    await h.viewModel.onOnline();
    expect(h.viewModel.getSnapshot().phase).toBe('update-required');
  });

  it('TC-BOOT-026 update-required 뒤 재조회가 unavailable이어도 유지한다', async () => {
    const h = createBootHarness({ results: ['update-required', 'unavailable'] });
    await h.viewModel.start();
    await h.viewModel.onOnline();
    await h.viewModel.onAppActive();
    expect(h.viewModel.getSnapshot().phase).toBe('update-required');
  });
});

describe('BootViewModel 전환', () => {
  it('TC-AUTH-056 세션 만료 이벤트(REAUTHENTICATION_REQUIRED)를 받으면 어느 화면에서든 로그인으로 간다', async () => {
    const h = createBootHarness();
    await h.signIn();
    await h.viewModel.start();
    expect(h.viewModel.getSnapshot().phase).toBe('main');

    h.events.emit({ type: 'session-expired' });

    expect(h.viewModel.getSnapshot()).toMatchObject({ phase: 'login', mode: null });
  });

  it('TC-AUTH-056 dispose 뒤에는 이벤트에 반응하지 않는다', async () => {
    const h = createBootHarness();
    await h.signIn();
    await h.viewModel.start();
    h.viewModel.dispose();
    h.events.emit({ type: 'session-expired' });
    expect(h.viewModel.getSnapshot().phase).toBe('main');
  });

  it('TC-AUTH-008 로그인 성공 이동 요청(toMain member)은 메인(회원)을 연다', async () => {
    const h = createBootHarness();
    await h.viewModel.start();
    h.viewModel.toMain('member');
    expect(h.viewModel.getSnapshot()).toMatchObject({ phase: 'main', mode: 'member' });
  });

  it('TC-AUTH-032 게스트 진입 요청은 메인(게스트)을 연다', async () => {
    const h = createBootHarness();
    await h.viewModel.start();
    h.viewModel.toMain('guest');
    expect(h.viewModel.getSnapshot()).toMatchObject({ phase: 'main', mode: 'guest' });
  });

  it('TC-AUTH-010 가입 필요면 sign-up으로 가며 idToken·rawNonce를 상태로 들고 있다', async () => {
    const h = createBootHarness();
    await h.viewModel.start();
    h.viewModel.toSignUp({ idToken: 'id', rawNonce: 'raw' });
    expect(h.viewModel.getSnapshot()).toEqual({
      phase: 'sign-up',
      mode: null,
      pendingSignUp: { idToken: 'id', rawNonce: 'raw' },
    });
  });

  it('TC-AUTH-033 TC-AUTH-035 로그인 요청(toLogin)은 mode와 pendingSignUp을 비운다', async () => {
    const h = createBootHarness();
    await h.viewModel.start();
    h.viewModel.toSignUp({ idToken: 'id', rawNonce: 'raw' });
    h.viewModel.toLogin();
    expect(h.viewModel.getSnapshot()).toEqual({ phase: 'login', mode: null, pendingSignUp: null });
  });
});
