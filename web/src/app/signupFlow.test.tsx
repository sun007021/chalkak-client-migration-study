import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { makeHarness, renderApp } from '../test/appHarness';
import { ME, loadFixture } from '../test/fixtures';
import { screenViews } from '../test/screenViews';
import { SIGNUP_CONFIRM, SIGNUP_PUT, SIGNUP_UPLOADS, routeSignup, sequence } from '../test/signatureRoutes';
import { drawStroke, stubCanvasRect } from '../test/signatureDrawing';

const LOGIN = 'POST /auth/social-login';
const STROKE = [{ x: 100, y: 100 }, { x: 300, y: 220 }, { x: 520, y: 140 }];

const kakao = () => screen.getByTestId('login.kakao-button');
const agreeAllAndNext = () => {
  fireEvent.click(screen.getByTestId('terms.agree-all-checkbox'));
  fireEvent.click(screen.getByTestId('terms.next-button'));
};
async function drawAndSubmit() {
  const canvas = await screen.findByTestId('signature.canvas');
  stubCanvasRect(canvas);
  drawStroke(canvas, STROKE);
  fireEvent.click(screen.getByTestId('signature.submit-button'));
  await screen.findByTestId('signature-preview.root');
}
async function startFromLogin(options: { strict?: boolean } = {}) {
  const h = makeHarness();
  h.ff.route(LOGIN, () => loadFixture('auth/social-login__sign-up-required.json').toResponse());
  const view = renderApp(h.container, '/login', options);
  await screen.findByTestId('login.root');
  return { h, ...view };
}
/** 로그인 → 약관 → 그리기 → 미리보기까지. */
async function reachPreview() {
  fireEvent.click(kakao());
  await screen.findByTestId('terms.root');
  agreeAllAndNext();
  await drawAndSubmit();
}

describe('가입 전체 흐름 (로그인 → 약관 → 사인 → 미리보기 → 홈)', () => {
  it('TC-ONB-015 TC-ONB-018 TC-ONB-019 TC-ONB-024 카카오 SIGN_UP_REQUIRED 뒤 약관·사인·미리보기를 거쳐 가입하면 회원 홈이 열리고 요청 순서가 맞다', async () => {
    const { h, path } = await startFromLogin();
    routeSignup(h.ff);
    await reachPreview();
    fireEvent.click(screen.getByTestId('signature-preview.confirm-button'));
    expect(await screen.findByTestId('home.root')).toHaveAttribute('data-mode', 'member');
    expect(path()).toBe('/home');
    expect(sequence(h.ff)).toEqual([LOGIN, SIGNUP_UPLOADS, SIGNUP_PUT, SIGNUP_CONFIRM]);
    expect((await h.store.read()).userId).toBe(ME);
  });

  it('TC-ONB-049 screen_view는 terms, onboarding_signature, onboarding_signature_preview 순으로 한 번씩이다(StrictMode 포함)', async () => {
    const { h } = await startFromLogin({ strict: true });
    routeSignup(h.ff);
    await reachPreview();
    fireEvent.click(screen.getByTestId('signature-preview.confirm-button'));
    await screen.findByTestId('home.root');
    expect(screenViews(h.tracker)).toEqual(['login', 'terms', 'onboarding_signature', 'onboarding_signature_preview', 'home']);
  });

  it('TC-ONB-016 가입 전체 과정의 요청에 동의 관련 필드나 API 호출이 없다', async () => {
    const { h } = await startFromLogin();
    routeSignup(h.ff);
    await reachPreview();
    fireEvent.click(screen.getByTestId('signature-preview.confirm-button'));
    await screen.findByTestId('home.root');
    for (const call of h.ff.calls) {
      const text = `${call.url} ${typeof call.body === 'string' ? call.body : ''}`;
      expect(text, call.path).not.toMatch(/agree|consent|terms|약관|동의/i);
    }
    expect(h.ff.calls.map((c) => c.path).filter((p) => /terms|consent|agree/i.test(p))).toEqual([]);
  });

  it('TC-ONB-046 한 번의 로그인 시도 안에서 같은 idToken·rawNonce 쌍을 쓰고, 새 로그인 시도는 새 쌍으로 교체된다', async () => {
    const { h } = await startFromLogin();
    routeSignup(h.ff);
    expect(h.social.issued).toHaveLength(0);
    fireEvent.click(kakao());
    await screen.findByTestId('terms.root');
    expect(h.container.signupDraft.get()).toEqual(h.social.issued[0]);
    fireEvent.click(screen.getByTestId('terms.back-button')); // 가입 컨텍스트 폐기
    await screen.findByTestId('login.root');
    fireEvent.click(kakao());
    await screen.findByTestId('terms.root');
    agreeAllAndNext();
    await drawAndSubmit();
    fireEvent.click(screen.getByTestId('signature-preview.confirm-button'));
    await waitFor(() => expect(h.ff.callsTo(SIGNUP_UPLOADS)).toHaveLength(1));
    const body = JSON.parse(h.ff.callsTo(SIGNUP_UPLOADS)[0]!.body as string) as { idToken: string; rawNonce: string };
    expect(h.social.issued).toHaveLength(2);
    expect({ idToken: body.idToken, rawNonce: body.rawNonce }).toEqual(h.social.issued[1]);
    expect(body.idToken).not.toBe(h.social.issued[0]!.idToken);
  });
});

describe('가입 흐름의 뒤로 가기와 재진입', () => {
  it('REQ-ONB-006 REQ-ONB-027 미리보기 → 그리기 → 약관으로 뒤로 가면 약관은 다시 동의를 받는다(체크 초기화)', async () => {
    const { router } = await startFromLogin();
    await reachPreview();
    await act(async () => router.navigate(-1));
    expect(await screen.findByTestId('signature.root')).toBeInTheDocument();
    await act(async () => router.navigate(-1));
    expect(await screen.findByTestId('terms.root')).toBeInTheDocument();
    expect(screen.getByTestId('terms.agree-all-checkbox')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('terms.next-button')).toBeDisabled();
  });

  it('TC-ONB-024 TC-NAV-040 가입이 끝난 뒤 뒤로 가도 약관·사인·미리보기 화면이 다시 보이지 않는다', async () => {
    const { h, router } = await startFromLogin();
    routeSignup(h.ff);
    await reachPreview();
    fireEvent.click(screen.getByTestId('signature-preview.confirm-button'));
    await screen.findByTestId('home.root');
    for (let i = 0; i < 4; i++) {
      await act(async () => router.navigate(-1));
      await waitFor(() => expect(document.querySelector('[data-testid]')).not.toBeNull());
      for (const id of ['terms.root', 'signature.root', 'signature-preview.root']) expect(screen.queryByTestId(id), id).not.toBeInTheDocument();
    }
  });

  it('TC-ONB-045 가입을 끝내기 전에 앱을 다시 시작하면(세션 없음) 로그인 화면이 열린다', async () => {
    const { h, unmount } = await startFromLogin();
    await reachPreview();
    expect(await h.store.read()).toEqual({ userId: null, tokens: null, isGuest: false });
    unmount();
    const restarted = makeHarness();
    renderApp(restarted.container, '/');
    expect(await screen.findByTestId('login.root')).toBeInTheDocument();
  });

  it('TC-ONB-044 미리보기에서 진행 중 뒤로 가기(화면 이탈)하면 세션이 저장되지 않는다', async () => {
    const { h, router } = await startFromLogin();
    routeSignup(h.ff, {
      signup: [
        async () => {
          await h.clock.sleep(5_000);
          return loadFixture('onboarding/signup__success.json').toResponse();
        },
      ],
    });
    await reachPreview();
    fireEvent.click(screen.getByTestId('signature-preview.confirm-button'));
    await waitFor(() => expect(h.ff.callsTo(SIGNUP_CONFIRM)).toHaveLength(1));
    await act(async () => router.navigate(-1));
    await act(async () => h.clock.advance(10_000));
    expect(h.store.writes).toHaveLength(0);
    expect(screen.queryByTestId('home.root')).not.toBeInTheDocument();
  });
});
