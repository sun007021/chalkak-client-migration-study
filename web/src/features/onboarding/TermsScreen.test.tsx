import { fireEvent, screen, waitFor } from '@testing-library/react';
import { TERMS_URLS } from '../../constants';
import { t } from '../../copy/ko';
import { makeHarness, renderApp } from '../../test/appHarness';
import { loadFixture } from '../../test/fixtures';

const CREDENTIAL = { idToken: 'fake-id-token-1', rawNonce: 'fake-raw-nonce-1' };

async function openTerms(options: { draft?: boolean; strict?: boolean } = {}) {
  const h = makeHarness();
  if (options.draft !== false) h.container.signupDraft.set(CREDENTIAL);
  const view = renderApp(h.container, '/signup/terms', { strict: options.strict });
  return { h, ...view };
}
async function readyTerms(options: Parameters<typeof openTerms>[0] = {}) {
  const ctx = await openTerms(options);
  await screen.findByTestId('terms.root');
  return ctx;
}
// check-testids가 리터럴을 찾으므로 맵으로 둔다.
const BOX_IDS = { 'agree-all': 'terms.agree-all-checkbox', service: 'terms.service-checkbox', privacy: 'terms.privacy-checkbox' } as const;
const box = (name: keyof typeof BOX_IDS) => screen.getByTestId(BOX_IDS[name]);
const next = () => screen.getByTestId('terms.next-button');
const checked = (el: HTMLElement) => el.getAttribute('aria-checked');

describe('약관 화면 구성', () => {
  it('TC-ONB-001 환영 제목, "전체 동의", "(필수) 서비스 이용약관", "(필수) 개인정보 처리방침", 각 "보기", "다음"이 보인다', async () => {
    await readyTerms();
    expect(screen.getByTestId('terms.title')).toHaveTextContent(/찰칵에\s*오신 것을 환영합니다\./);
    expect(box('agree-all')).toHaveTextContent(t('onb.terms.agree-all'));
    expect(box('service')).toHaveTextContent(t('onb.terms.service'));
    expect(box('service')).toHaveTextContent('(필수) 서비스 이용약관');
    expect(box('privacy')).toHaveTextContent(t('onb.terms.privacy'));
    expect(box('privacy')).toHaveTextContent('(필수) 개인정보 처리방침');
    expect(screen.getByTestId('terms.service-view-button')).toHaveTextContent(t('onb.terms.view'));
    expect(screen.getByTestId('terms.privacy-view-button')).toHaveTextContent('보기');
    expect(next()).toHaveTextContent(t('onb.terms.next'));
    expect(screen.getByTestId('terms.back-button')).toBeInTheDocument();
  });

  it('TC-ONB-002 진입 직후 체크박스가 모두 해제되고 "다음"이 비활성이다. 열기 실패 문구도 없다', async () => {
    await readyTerms();
    for (const name of ['agree-all', 'service', 'privacy'] as const) {
      expect(box(name)).toHaveAttribute('role', 'checkbox');
      expect(checked(box(name))).toBe('false');
    }
    expect(next()).toBeDisabled();
    expect(screen.queryByTestId('legal-doc.open-failed-message')).not.toBeInTheDocument();
  });
});

describe('약관 동의 상호작용', () => {
  it('TC-ONB-003 TC-ONB-004 전체 동의를 켜면 두 필수 항목이 선택되고 다음이 활성이며, 다시 누르면 모두 해제된다', async () => {
    await readyTerms();
    fireEvent.click(box('agree-all'));
    expect([checked(box('service')), checked(box('privacy')), checked(box('agree-all'))]).toEqual(['true', 'true', 'true']);
    expect(next()).toBeEnabled();
    fireEvent.click(box('agree-all'));
    expect([checked(box('service')), checked(box('privacy')), checked(box('agree-all'))]).toEqual(['false', 'false', 'false']);
    expect(next()).toBeDisabled();
  });

  it('TC-ONB-005 필수 항목 하나만 선택하면 전체 동의는 해제 표시이고 다음은 비활성이다', async () => {
    await readyTerms();
    fireEvent.click(box('service'));
    expect(checked(box('service'))).toBe('true');
    expect(checked(box('agree-all'))).toBe('false');
    expect(next()).toBeDisabled();
  });

  it('TC-ONB-006 TC-ONB-007 각각 선택하면 두 번째에서 전체 동의가 자동으로 켜지고 다음이 활성이며, 하나를 해제하면 다시 꺼진다', async () => {
    await readyTerms();
    fireEvent.click(box('service'));
    fireEvent.click(box('privacy'));
    expect(checked(box('agree-all'))).toBe('true');
    expect(next()).toBeEnabled();
    fireEvent.click(box('privacy'));
    expect(checked(box('agree-all'))).toBe('false');
    expect(next()).toBeDisabled();
  });

  it('체크박스는 키보드(Space)로도 토글된다', async () => {
    await readyTerms();
    const service = box('service');
    service.focus();
    fireEvent.keyDown(service, { key: ' ' });
    fireEvent.keyUp(service, { key: ' ' });
    await waitFor(() => expect(checked(service)).toBe('true'));
  });

  it('Enter로는 체크박스가 토글되지 않는다(Space만)', async () => {
    await readyTerms();
    const service = box('service');
    fireEvent.keyDown(service, { key: 'Enter' });
    expect(checked(service)).toBe('false');
  });
});

describe('약관 문서 보기 (새 탭, D-25)', () => {
  it('TC-ONB-008 TC-ONB-009 "보기"는 각각 공통 상수 URL을 새 탭으로 열고 앱 화면은 그대로이며 screen_view는 더 나가지 않는다', async () => {
    const { h, path } = await readyTerms();
    const before = h.tracker.events.length;
    fireEvent.click(screen.getByTestId('terms.service-view-button'));
    fireEvent.click(screen.getByTestId('terms.privacy-view-button'));
    expect(h.opener.opened).toEqual([TERMS_URLS.service, TERMS_URLS.privacy]);
    expect(path()).toBe('/signup/terms');
    // terms_of_service / privacy_policy는 앱 안 화면이 없는 Web 새 탭이라 보내지 않는다(REQ-ONB-011, Web 해당 없음).
    expect(h.tracker.events.slice(before).filter((e) => e.name === 'screen_view')).toEqual([]);
    expect(h.ff.calls).toHaveLength(0);
  });

  it('TC-ONB-014 문서를 열었다 돌아와도 체크 상태가 유지된다', async () => {
    const { h } = await readyTerms();
    fireEvent.click(box('service'));
    fireEvent.click(screen.getByTestId('terms.service-view-button'));
    fireEvent.click(screen.getByTestId('terms.privacy-view-button'));
    expect(h.opener.opened).toHaveLength(2);
    expect(checked(box('service'))).toBe('true');
    expect(checked(box('privacy'))).toBe('false');
    expect(next()).toBeDisabled();
  });

  it('TC-ONB-013 새 탭을 열 수 없으면 "문서를 열 수 없어요"를 보이고, 다시 열기에 성공하면 사라진다', async () => {
    const { h } = await readyTerms();
    h.opener.result = false;
    fireEvent.click(screen.getByTestId('terms.service-view-button'));
    expect(await screen.findByTestId('legal-doc.open-failed-message')).toHaveTextContent(t('onb.terms.doc.cannot-open'));
    expect(screen.getByTestId('legal-doc.open-failed-message')).toHaveTextContent('문서를 열 수 없어요');
    h.opener.result = true;
    fireEvent.click(screen.getByTestId('terms.service-view-button'));
    await waitFor(() => expect(screen.queryByTestId('legal-doc.open-failed-message')).not.toBeInTheDocument());
  });
});

describe('약관 → 다음 / 뒤로', () => {
  it('TC-ONB-015 두 항목 동의 후 "다음"을 누르면 사인 그리기(가입 모드)가 push로 열린다', async () => {
    const { path, router } = await readyTerms();
    fireEvent.click(box('agree-all'));
    fireEvent.click(next());
    const root = await screen.findByTestId('signature.root');
    expect(root).toHaveAttribute('data-mode', 'onboarding');
    expect(path()).toBe('/signup/signature');
    expect(router.state.historyAction).toBe('PUSH');
  });

  it('TC-ONB-016 약관 화면에서 동의하고 다음으로 가기까지 요청이 0건이다(동의는 전송하지 않는다)', async () => {
    const { h } = await readyTerms();
    fireEvent.click(box('agree-all'));
    fireEvent.click(next());
    await screen.findByTestId('signature.root');
    expect(h.ff.calls).toHaveLength(0);
    expect(await h.store.read()).toEqual({ userId: null, tokens: null, isGuest: false });
  });

  it('TC-ONB-016 화면을 다시 열면(재진입·새로고침) 동의 상태가 초기화된다', async () => {
    const first = await readyTerms();
    fireEvent.click(box('agree-all'));
    first.unmount();
    await readyTerms();
    expect(checked(box('agree-all'))).toBe('false');
    expect(next()).toBeDisabled();
  });

  it('TC-ONB-017 뒤로 버튼은 로그인 화면으로 replace 이동하고 보관하던 idToken·rawNonce를 폐기한다', async () => {
    const { h, path, router } = await readyTerms();
    fireEvent.click(box('agree-all'));
    fireEvent.click(screen.getByTestId('terms.back-button'));
    expect(await screen.findByTestId('login.root')).toBeInTheDocument();
    expect(path()).toBe('/login');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(h.container.signupDraft.get()).toBeNull();
    expect(h.ff.calls).toHaveLength(0);
  });

  it('REQ-ONB-023 가입 컨텍스트(idToken·rawNonce)가 없으면(새로고침 등) 약관을 보이지 않고 로그인으로 replace 이동한다', async () => {
    const { h, path } = await openTerms({ draft: false });
    expect(await screen.findByTestId('login.root')).toBeInTheDocument();
    expect(screen.queryByTestId('terms.root')).not.toBeInTheDocument();
    expect(path()).toBe('/login');
    expect(h.ff.calls).toHaveLength(0);
  });

  it('TC-ONB-018 로그인 화면에서 카카오 버튼을 누르고 SIGN_UP_REQUIRED를 받으면 약관 화면이 열린다', async () => {
    const h = makeHarness();
    const { path } = renderApp(h.container, '/login');
    h.ff.route('POST /auth/social-login', () => loadFixture('auth/social-login__sign-up-required.json').toResponse());
    fireEvent.click(await screen.findByTestId('login.kakao-button'));
    expect(await screen.findByTestId('terms.root')).toBeInTheDocument();
    expect(path()).toBe('/signup/terms');
    expect(checked(box('agree-all'))).toBe('false');
  });

  it('StrictMode에서도 체크 상태와 이동이 한 번씩만 동작한다', async () => {
    const { path } = await readyTerms({ strict: true });
    fireEvent.click(box('agree-all'));
    expect(checked(box('agree-all'))).toBe('true');
    fireEvent.click(next());
    await waitFor(() => expect(path()).toBe('/signup/signature'));
  });
});
