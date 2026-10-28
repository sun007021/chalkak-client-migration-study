import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { t } from '../../copy/ko';
import { makeHarness, renderApp } from '../../test/appHarness';
import type { Harness } from '../../test/appHarness';
import { fakePng } from '../../test/FakeSignatureRasterizer';
import { networkFailure } from '../../test/fakeFetch';
import { ME, loadFixture, memberSession } from '../../test/fixtures';
import { screenViews } from '../../test/screenViews';
import { CARD_GET, CHANGE_CONFIRM, CHANGE_PUT, CHANGE_UPLOADS, SIGNUP_CONFIRM, SIGNUP_PUT, SIGNUP_UPLOADS, fx, routeChange, routeSignup, sequence } from '../../test/signatureRoutes';

const CREDENTIAL = { idToken: 'fake-id-token-1', rawNonce: 'fake-raw-nonce-1' };
const pendingFx = fx('onboarding/signup__signature-processing-pending.json');

async function openPreview(mode: 'onboarding' | 'change', options: { strict?: boolean; png?: boolean } = {}) {
  const h = makeHarness(mode === 'change' ? { session: memberSession() } : {});
  if (mode === 'onboarding') h.container.signupDraft.set(CREDENTIAL);
  if (options.png !== false) h.container.signatureDraft.set(fakePng(2048));
  const view = renderApp(h.container, mode === 'onboarding' ? '/signup/signature/preview' : '/settings/signature/preview', { strict: options.strict });
  const root = await screen.findByTestId('signature-preview.root');
  return { h, root, ...view };
}
const confirm = () => screen.getByTestId('signature-preview.confirm-button');
const redraw = () => screen.getByTestId('signature-preview.redraw-button');
const toastText = () => screen.queryByTestId('toast.message')?.textContent ?? null;
const tick = (h: Harness, ms: number) => act(async () => h.clock.advance(ms));

describe('미리보기 화면 구성', () => {
  it('TC-ONB-048 가입 모드: "이렇게 보여요", "다시 그리기", "시작하기"가 보이고 변경 안내는 없다', async () => {
    const { root } = await openPreview('onboarding');
    expect(root).toHaveAttribute('data-mode', 'onboarding');
    expect(screen.getByTestId('signature-preview.title')).toHaveTextContent(t('onb.sign.preview.title'));
    expect(screen.getByTestId('signature-preview.title')).toHaveTextContent('이렇게 보여요');
    expect(redraw()).toHaveTextContent('다시 그리기');
    expect(confirm()).toHaveTextContent(t('onb.sign.preview.start'));
    expect(confirm()).toHaveTextContent('시작하기');
    expect(confirm()).toBeEnabled();
    expect(screen.queryByTestId('signature-preview.change-notice')).not.toBeInTheDocument();
    expect(screen.queryByTestId('signature-preview.loading')).not.toBeInTheDocument();
  });

  it('TC-SIGN-017 변경 모드: "사인 변경하기"와 "사인 변경까지 시간이 조금 걸릴 수 있어요" 안내가 보인다', async () => {
    const { root } = await openPreview('change');
    expect(root).toHaveAttribute('data-mode', 'change');
    expect(screen.getByTestId('signature-preview.title')).toHaveTextContent('이렇게 보여요');
    expect(redraw()).toHaveTextContent('다시 그리기');
    expect(confirm()).toHaveTextContent(t('sign.change.confirm'));
    expect(confirm()).toHaveTextContent('사인 변경하기');
    expect(screen.getByTestId('signature-preview.change-notice')).toHaveTextContent('사인 변경까지 시간이 조금 걸릴 수 있어요');
  });

  it('REQ-SIGN-010 내보낼 PNG를 blob URL 이미지로 보이고, 화면을 떠나면 URL을 해제한다(StrictMode에서도 새는 URL이 없다)', async () => {
    const { h, unmount } = await openPreview('onboarding', { strict: true });
    const image = screen.getByTestId('signature-preview.image');
    expect(image.tagName).toBe('IMG');
    const src = image.getAttribute('src')!;
    expect(src).toMatch(/^blob:fake-/);
    expect(h.blobUrls.created).toContain(h.container.signatureDraft.get());
    unmount();
    expect(h.blobUrls.revoked.sort()).toEqual(h.blobUrls.created.map((_b, i) => `blob:fake-${i + 1}`).sort());
  });

  it('TC-ONB-049 TC-SIGN-043 screen_view는 가입이 onboarding_signature_preview, 변경이 change_signature_preview를 한 번만 보낸다(StrictMode 포함)', async () => {
    const a = await openPreview('onboarding', { strict: true });
    expect(screenViews(a.h.tracker).filter((n) => n === 'onboarding_signature_preview')).toHaveLength(1);
    a.unmount();
    const b = await openPreview('change', { strict: true });
    expect(screenViews(b.h.tracker).filter((n) => n === 'change_signature_preview')).toHaveLength(1);
  });

  it('PNG가 없으면(새로고침 등) 미리보기 대신 그리기 경로로 replace 이동하고 screen_view를 보내지 않는다', async () => {
    const h = makeHarness({ session: memberSession() });
    const { path } = renderApp(h.container, '/settings/signature/preview');
    expect(await screen.findByTestId('signature.root')).toHaveAttribute('data-mode', 'change');
    expect(path()).toBe('/settings/signature');
    expect(screenViews(h.tracker)).not.toContain('change_signature_preview');
    expect(h.ff.calls).toHaveLength(0);
  });

  it('가입 컨텍스트가 없으면(새로고침 등) 로그인으로 replace 이동한다', async () => {
    const h = makeHarness();
    h.container.signatureDraft.set(fakePng());
    const { path } = renderApp(h.container, '/signup/signature/preview');
    expect(await screen.findByTestId('login.root')).toBeInTheDocument();
    expect(path()).toBe('/login');
  });
});

describe('미리보기 → 다시 그리기', () => {
  it('TC-SIGN-018 REQ-SIGN-011 "다시 그리기"는 서버 호출 없이 그리기 화면으로 돌아가고 PNG와 이전 획을 지운다', async () => {
    const { h, path } = await openPreview('onboarding');
    fireEvent.click(redraw());
    const draw = await screen.findByTestId('signature.root');
    expect(path()).toBe('/signup/signature');
    expect(draw).toHaveAttribute('data-mode', 'onboarding');
    expect(screen.getByTestId('signature.submit-button')).toBeDisabled();
    expect(screen.getByTestId('signature.canvas-hint')).toBeInTheDocument();
    expect(h.container.signatureDraft.get()).toBeNull();
    expect(h.ff.calls).toHaveLength(0);
  });

  it('TC-SIGN-042 변경 도중 그리기·미리보기를 벗어나 설정으로 돌아가면 서버 호출이 0건이다', async () => {
    const { h, router } = await openPreview('change');
    await router.navigate('/settings');
    expect(await screen.findByTestId('settings.root')).toBeInTheDocument();
    expect(h.ff.calls).toHaveLength(0);
    expect(h.container.signatureCard.state).toEqual({ status: 'idle', imageUrl: null });
  });
});

describe('가입 확정', () => {
  it('TC-ONB-019 TC-ONB-024 "시작하기" → uploads → PUT → signup 순서로 가입하고 세션을 저장해 홈(회원)으로 replace 이동한다', async () => {
    const { h, path, router } = await openPreview('onboarding');
    routeSignup(h.ff);
    fireEvent.click(confirm());
    const home = await screen.findByTestId('home.root');
    expect(home).toHaveAttribute('data-mode', 'member');
    expect(sequence(h.ff)).toEqual([SIGNUP_UPLOADS, SIGNUP_PUT, SIGNUP_CONFIRM]);
    expect(path()).toBe('/home');
    expect(router.state.historyAction).toBe('REPLACE');
    const saved = await h.store.read();
    expect(saved).toMatchObject({ userId: ME, isGuest: false });
    expect(saved.tokens?.refreshToken).toBe('fixture-refresh-token-1');
    expect(h.container.signupDraft.get()).toBeNull();
    expect(h.container.signatureDraft.get()).toBeNull();
    expect(h.ff.callsTo('POST /auth/social-login')).toHaveLength(0);
  });

  it('TC-ONB-022 사인 PUT은 PNG 전체를 image/png로 보낸다', async () => {
    const { h } = await openPreview('onboarding');
    const png = h.container.signatureDraft.get()!;
    routeSignup(h.ff);
    fireEvent.click(confirm());
    await screen.findByTestId('home.root');
    const put = h.ff.callsTo(SIGNUP_PUT)[0]!;
    expect(put.body).toBe(png);
    expect(put.headers['content-type']).toBe('image/png');
    expect(put.headers['authorization']).toBeUndefined();
  });

  it('REQ-ONB-012 REQ-ONB-017 진행 중에는 진행 표시가 보이고 버튼이 비활성이며, PENDING 재시도 대기 중에도 유지된다', async () => {
    const { h } = await openPreview('onboarding');
    routeSignup(h.ff, { signup: [pendingFx, pendingFx, fx('onboarding/signup__success.json')] });
    fireEvent.click(confirm());
    expect(await screen.findByTestId('signature-preview.loading')).toBeInTheDocument();
    expect(confirm()).toBeDisabled();
    expect(redraw()).toBeDisabled();
    await waitFor(() => expect(h.ff.callsTo(SIGNUP_CONFIRM)).toHaveLength(1));
    await tick(h, 500);
    expect(screen.getByTestId('signature-preview.loading')).toBeInTheDocument();
    expect(confirm()).toBeDisabled();
    await tick(h, 500);
    await waitFor(() => expect(h.ff.callsTo(SIGNUP_CONFIRM)).toHaveLength(2));
    expect(screen.getByTestId('signature-preview.loading')).toBeInTheDocument();
    await tick(h, 1_000);
    expect(await screen.findByTestId('home.root')).toBeInTheDocument();
    expect(h.ff.callsTo(SIGNUP_CONFIRM)).toHaveLength(3);
    expect(h.ff.callsTo(SIGNUP_UPLOADS)).toHaveLength(1);
  });

  it('TC-ONB-028 PENDING이 소진되면 "사인 처리에 시간이 걸리고 있어요. 다시 시도해 주세요."를 토스트로 보이고 미리보기에 머물며 다시 누를 수 있다', async () => {
    const { h, path } = await openPreview('onboarding');
    routeSignup(h.ff, { signup: [pendingFx] });
    fireEvent.click(confirm());
    await waitFor(() => expect(h.ff.callsTo(SIGNUP_CONFIRM)).toHaveLength(1));
    for (let i = 0; i < 10; i++) await tick(h, 1_000);
    await waitFor(() => expect(toastText()).toBe('사인 처리에 시간이 걸리고 있어요. 다시 시도해 주세요.'));
    expect(h.ff.callsTo(SIGNUP_CONFIRM)).toHaveLength(11);
    expect(path()).toBe('/signup/signature/preview');
    expect(screen.queryByTestId('signature-preview.loading')).not.toBeInTheDocument();
    expect(confirm()).toBeEnabled();
  });

  it('TC-ONB-043 "시작하기"를 3회 연타해도 uploads, PUT, signup이 각 1회뿐이다', async () => {
    const { h } = await openPreview('onboarding');
    routeSignup(h.ff);
    fireEvent.click(confirm());
    fireEvent.click(confirm());
    fireEvent.click(confirm());
    await screen.findByTestId('home.root');
    expect(sequence(h.ff)).toEqual([SIGNUP_UPLOADS, SIGNUP_PUT, SIGNUP_CONFIRM]);
  });

  it('TC-ONB-041 네트워크 오류면 "네트워크 연결을 확인해 주세요."를 토스트로 보이고 그린 사인(미리보기)이 유지되며 다시 누를 수 있다', async () => {
    const { h, path } = await openPreview('onboarding');
    routeSignup(h.ff, { uploads: [networkFailure, fx('onboarding/signup-uploads__success.json')] });
    fireEvent.click(confirm());
    await waitFor(() => expect(toastText()).toBe('네트워크 연결을 확인해 주세요.'));
    expect(path()).toBe('/signup/signature/preview');
    expect(screen.getByTestId('signature-preview.image')).toBeInTheDocument();
    expect(h.container.signatureDraft.get()).not.toBeNull();
    expect(confirm()).toBeEnabled();
    fireEvent.click(confirm());
    await screen.findByTestId('home.root');
  });

  it('TC-ONB-035 서버가 사인을 거절하면(400) 문구를 보이고 그리기 화면으로 돌아가 빈 패드에서 다시 그릴 수 있다', async () => {
    const { h, path } = await openPreview('onboarding');
    routeSignup(h.ff, { signup: [fx('onboarding/signup__invalid-signature.json')] });
    fireEvent.click(confirm());
    expect(await screen.findByTestId('signature.root')).toBeInTheDocument();
    expect(path()).toBe('/signup/signature');
    expect(toastText()).toBe('사용할 수 없는 사인이에요. 다시 그려주세요.');
    expect(screen.getByTestId('signature.submit-button')).toBeDisabled();
  });

  it('TC-ONB-030 TC-ONB-033 만료(401)면 로그인 화면으로 돌아가고 "로그인 정보가 만료되었어요. 다시 로그인해 주세요."를 보이며 가입 컨텍스트를 폐기한다', async () => {
    const { h, path } = await openPreview('onboarding');
    routeSignup(h.ff, { uploads: [fx('onboarding/signup-uploads__unauthorized.json')] });
    fireEvent.click(confirm());
    expect(await screen.findByTestId('login.root')).toBeInTheDocument();
    expect(path()).toBe('/login');
    expect(toastText()).toBe('로그인 정보가 만료되었어요. 다시 로그인해 주세요.');
    expect(h.container.signupDraft.get()).toBeNull();
  });

  it('TC-ONB-032 차단(403)이면 서버 message를 보이고 로그인 화면으로 돌아간다', async () => {
    const { h } = await openPreview('onboarding');
    routeSignup(h.ff, { uploads: [fx('onboarding/signup-uploads__forbidden-banned.json')] });
    fireEvent.click(confirm());
    expect(await screen.findByTestId('login.root')).toBeInTheDocument();
    expect(toastText()).toBe('차단된 소셜 계정입니다.');
  });

  it('TC-ONB-031 업로드 발급이 400(이미 가입된 계정)이면 social-login을 다시 불러 홈으로 간다', async () => {
    const { h } = await openPreview('onboarding');
    routeSignup(h.ff, { uploads: [fx('onboarding/signup-uploads__already-registered.json')] });
    h.ff.route('POST /auth/social-login', fx('auth/social-login__login-success.json'));
    fireEvent.click(confirm());
    expect(await screen.findByTestId('home.root')).toBeInTheDocument();
    expect(sequence(h.ff)).toEqual([SIGNUP_UPLOADS, 'POST /auth/social-login']);
    expect((await h.store.read()).userId).toBe(ME);
  });

  it('TC-ONB-044 진행 중 화면을 떠나면 요청을 취소하고 세션을 저장하지 않으며 오류도 보이지 않는다', async () => {
    const { h, router } = await openPreview('onboarding');
    routeSignup(h.ff, {
      signup: [
        async () => {
          await h.clock.sleep(5_000);
          return loadFixture('onboarding/signup__success.json').toResponse();
        },
      ],
    });
    fireEvent.click(confirm());
    await waitFor(() => expect(h.ff.callsTo(SIGNUP_CONFIRM)).toHaveLength(1));
    await router.navigate('/login');
    await screen.findByTestId('login.root');
    await tick(h, 10_000);
    expect(h.store.writes).toHaveLength(0);
    expect(toastText()).toBeNull();
    expect(h.ff.callsTo(SIGNUP_CONFIRM)[0]!.signal?.aborted).toBe(true);
  });
});

describe('사인 변경 확정', () => {
  it('TC-SIGN-019 TC-SIGN-025 TC-SIGN-026 "사인 변경하기" → uploads → PUT → 확정 후 설정으로 돌아가 토스트를 보이고 GET /users/me/signature를 다시 불러 썸네일을 쓴다', async () => {
    const { h, path } = await openPreview('change');
    routeChange(h.ff);
    fireEvent.click(confirm());
    expect(await screen.findByTestId('settings.root')).toBeInTheDocument();
    expect(path()).toBe('/settings');
    expect(await screen.findByTestId('toast.message')).toHaveTextContent('사인 반영까지 시간이 좀 걸릴 수 있어요!');
    await waitFor(() => expect(h.ff.callsTo(CARD_GET)).toHaveLength(1));
    expect(sequence(h.ff).slice(0, 4)).toEqual([CHANGE_UPLOADS, CHANGE_PUT, CHANGE_CONFIRM, CARD_GET]);
    await waitFor(() =>
      expect(h.container.signatureCard.state).toEqual({
        status: 'content',
        imageUrl: 'https://cdn.example.test/users/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/signature/thumbnail.png',
      }),
    );
    expect(h.container.signatureDraft.get()).toBeNull();
  });

  it('TC-SIGN-027 PUT 응답의 원본 URL은 사인 카드에 쓰지 않는다 — 재조회한 GET 응답만 쓴다', async () => {
    const { h } = await openPreview('change');
    routeChange(h.ff, { get: [fx('signature/users-me-signature__get-thumbnail-null.json')] });
    fireEvent.click(confirm());
    await screen.findByTestId('settings.root');
    await waitFor(() => expect(h.container.signatureCard.state.status).toBe('content'));
    expect(h.container.signatureCard.state.imageUrl).toBe('https://cdn.example.test/users/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/signature/original.png');
  });

  it('TC-SIGN-036 "사인 변경하기"를 연타해도 uploads 1회, PUT 1회, 확정 1회이다', async () => {
    const { h } = await openPreview('change');
    routeChange(h.ff);
    fireEvent.click(confirm());
    fireEvent.click(confirm());
    fireEvent.click(confirm());
    await screen.findByTestId('settings.root');
    expect(h.ff.callsTo(CHANGE_UPLOADS)).toHaveLength(1);
    expect(h.ff.callsTo(CHANGE_PUT)).toHaveLength(1);
    expect(h.ff.callsTo(CHANGE_CONFIRM)).toHaveLength(1);
  });

  it('TC-SIGN-030 정지 회원(403)은 토스트 "이용이 제한되어 사인을 변경할 수 없어요."를 보이고 이후 요청은 0건이며 미리보기에 머문다', async () => {
    const { h, path } = await openPreview('change');
    routeChange(h.ff, { uploads: [fx('signature/users-me-signature-uploads__forbidden-banned.json')] });
    fireEvent.click(confirm());
    await waitFor(() => expect(toastText()).toBe('이용이 제한되어 사인을 변경할 수 없어요.'));
    expect(sequence(h.ff)).toEqual([CHANGE_UPLOADS]);
    expect(path()).toBe('/settings/signature/preview');
    expect(confirm()).toBeEnabled();
  });

  it('TC-SIGN-023 업로드 PUT이 실패하면 확정 호출 0건이고 "사인을 저장하지 못했어요. 다시 시도해 주세요."를 보인다', async () => {
    const { h } = await openPreview('change');
    routeChange(h.ff, { put: [fx('signature/presigned-put__forbidden.json')] });
    fireEvent.click(confirm());
    await waitFor(() => expect(toastText()).toBe('사인을 저장하지 못했어요. 다시 시도해 주세요.'));
    expect(h.ff.callsTo(CHANGE_CONFIRM)).toHaveLength(0);
    expect(h.ff.callsTo(CARD_GET)).toHaveLength(0);
  });

  it('TC-SIGN-028 SIGNATURE_REUPLOAD_REQUIRED면 "사인을 다시 업로드해 주세요."를 보이고 다시 누르면 새 uploads부터 시작한다', async () => {
    const { h } = await openPreview('change');
    routeChange(h.ff, { confirm: [fx('signature/users-me-signature__put-reupload-required.json'), fx('signature/users-me-signature__put-success.json')] });
    fireEvent.click(confirm());
    await waitFor(() => expect(toastText()).toBe('사인을 다시 업로드해 주세요.'));
    fireEvent.click(confirm());
    await screen.findByTestId('settings.root');
    expect(h.ff.callsTo(CHANGE_UPLOADS)).toHaveLength(2);
  });

  it('TC-SIGN-029 서버가 사인을 거절하면(400 BUSINESS_ERROR) 문구를 보이고 그리기 화면으로 돌아간다', async () => {
    const { h, path } = await openPreview('change');
    routeChange(h.ff, { confirm: [fx('signature/users-me-signature__put-invalid-signature.json')] });
    fireEvent.click(confirm());
    expect(await screen.findByTestId('signature.root')).toHaveAttribute('data-mode', 'change');
    expect(path()).toBe('/settings/signature');
    expect(toastText()).toBe('사용할 수 없는 사인이에요. 다시 그려주세요.');
  });

  it('TC-SIGN-033 refresh도 REAUTHENTICATION_REQUIRED면 로그인 화면으로 가고 "로그인 정보가 만료되었어요. 다시 로그인해 주세요."를 보인다', async () => {
    const { h } = await openPreview('change');
    routeChange(h.ff, { confirm: [fx('signature/users-me-signature__put-unauthorized.json')] });
    h.ff.route('POST /auth/refresh', fx('auth/refresh__reauthentication-required.json'));
    fireEvent.click(confirm());
    expect(await screen.findByTestId('login.root')).toBeInTheDocument();
    expect(toastText()).toBe('로그인 정보가 만료되었어요. 다시 로그인해 주세요.');
  });

  it('TC-SIGN-034 네트워크 오류면 문구를 보이고 미리보기와 PNG가 유지된다', async () => {
    const { h } = await openPreview('change');
    routeChange(h.ff, { put: [networkFailure] });
    fireEvent.click(confirm());
    await waitFor(() => expect(toastText()).toBe('네트워크 연결을 확인해 주세요.'));
    expect(screen.getByTestId('signature-preview.image')).toBeInTheDocument();
    expect(h.container.signatureDraft.get()).not.toBeNull();
  });
});
