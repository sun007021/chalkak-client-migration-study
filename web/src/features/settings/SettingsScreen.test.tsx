import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { SETTINGS_BELOW_STATE } from '../../app/paths';
import { TERMS_URLS } from '../../constants';
import { t } from '../../copy/ko';
import { makeHarness, renderApp } from '../../test/appHarness';
import type { Harness } from '../../test/appHarness';
import { deferred } from '../../test/deferred';
import { networkFailure } from '../../test/fakeFetch';
import { guestSession, memberSession } from '../../test/fixtures';
import { recordToasts } from '../../test/toastLog';
import { screenViews } from '../../test/screenViews';
import { CARD_GET, SETTINGS_GET, SETTINGS_PATCH, SIGNATURE_URL, fx, resp, routeSettings, toastText } from '../../test/settingsHarness';
import type { StoredSession } from '../../core/auth/SessionStore';
import { EMPTY_SESSION } from '../../core/auth/SessionStore';

type RouteOptions = Parameters<typeof routeSettings>[1];

async function openSettings(o: { session?: StoredSession; strict?: boolean; version?: string; routes?: RouteOptions; path?: string } = {}) {
  const h = makeHarness({ session: o.session ?? memberSession(), appVersion: o.version });
  if ((o.session ?? memberSession()).tokens) routeSettings(h.ff, o.routes);
  const toasts = recordToasts(h.container.toast);
  const view = renderApp(h.container, o.path ?? '/settings', { strict: o.strict });
  await screen.findByTestId('settings.root');
  return { h, toasts, ...view };
}
/** 재시도(0.5초, 1초)와 비동기 렌더를 소화한다. */
const settle = (h: Harness) => act(async () => void (await h.clock.advance(5_000)));
const rowPosition = (a: HTMLElement, b: HTMLElement) => a.compareDocumentPosition(b);

describe('설정 탭 구성 (회원)', () => {
  it('TC-SET-001 REQ-SET-001 앱 설정(사인), 푸시 알림, 계정, 피드백, 정보 및 약관 섹션이 이 순서로 보이고 각 행이 있다', async () => {
    await openSettings();
    const ids = ['settings.signature-card', 'settings.push-section', 'settings.logout-row', 'settings.withdraw-row', 'settings.feedback-row', 'settings.privacy-row', 'settings.terms-row', 'settings.version-row'];
    const nodes = await Promise.all(ids.map((id) => screen.findByTestId(id)));
    for (let i = 1; i < nodes.length; i += 1) {
      expect(rowPosition(nodes[i - 1]!, nodes[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, ids[i]).toBeTruthy();
    }
    for (const heading of ['settings.section.app', 'settings.section.push', 'settings.section.account', 'settings.section.feedback', 'settings.section.info'] as const) {
      expect(screen.getByRole('heading', { name: t(heading) })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['앱 설정', '푸시 알림', '계정', '피드백', '정보 및 약관']);
    expect(screen.getByTestId('settings.logout-row')).toHaveTextContent('로그아웃');
    expect(screen.getByTestId('settings.withdraw-row')).toHaveTextContent('회원탈퇴');
    expect(screen.getByTestId('settings.feedback-row')).toHaveTextContent('피드백 보내기');
    expect(screen.getByTestId('settings.privacy-row')).toHaveTextContent('개인정보처리방침');
    expect(screen.getByTestId('settings.terms-row')).toHaveTextContent('이용약관');
    expect(screen.getByTestId('settings.version-row')).toHaveTextContent('버전정보');
    expect(screen.queryByTestId('settings.login-button')).not.toBeInTheDocument();
  });

  it('TC-SET-001 행은 모두 키보드로 다룰 수 있는 버튼이다(version 행 제외)', async () => {
    await openSettings();
    for (const id of ['settings.logout-row', 'settings.withdraw-row', 'settings.feedback-row', 'settings.privacy-row', 'settings.terms-row']) {
      expect(screen.getByTestId(id).tagName).toBe('BUTTON');
    }
  });

  it('TC-SET-002 사인 카드와 푸시 설정이 서로 독립으로 조회되고 한쪽 실패가 다른 쪽 표시를 막지 않는다', async () => {
    const { h } = await openSettings({ routes: { signature: [fx('signature/users-me-signature__get-internal-error.json')] } });
    await settle(h);
    expect(await screen.findByTestId('settings.signature-error')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('settings.push-topic-toggle')).toBeEnabled());
    expect(h.ff.callsTo(SETTINGS_GET)).toHaveLength(1);
    expect(h.ff.callsTo(CARD_GET).length).toBeGreaterThanOrEqual(1);
  });

  it('TC-SET-002 푸시 설정이 실패해도 사인 카드는 정상 표시된다', async () => {
    const { h } = await openSettings({ routes: { get: [fx('settings/notification-settings__get-internal-error.json')] } });
    await settle(h);
    expect(await screen.findByTestId('settings.signature-image')).toBeInTheDocument();
    expect(screen.getByTestId('settings.push-error')).toBeInTheDocument();
  });

  it('TC-SET-052 REQ-SET-003 설정이 보이면 screen_view settings가 한 번 전송된다(StrictMode 포함)', async () => {
    const { h } = await openSettings({ strict: true });
    await screen.findByTestId('settings.signature-image');
    expect(screenViews(h.tracker).filter((name) => name === 'settings')).toEqual(['settings']);
  });
});

describe('설정 사인 카드', () => {
  it('TC-SET-003 사인 카드는 제목 "사인 재설정", 현재 사인(썸네일), "변경하기" 버튼을 보인다', async () => {
    await openSettings();
    const card = await screen.findByTestId('settings.signature-card');
    expect(card).toHaveTextContent('사인 재설정');
    expect(await screen.findByTestId('settings.signature-image')).toHaveAttribute('src', SIGNATURE_URL.thumbnail);
    expect(screen.getByTestId('settings.signature-image')).toHaveAttribute('alt');
    expect(screen.getByTestId('settings.signature-change-button')).toHaveTextContent('변경하기');
    expect(within(card).getByTestId('settings.signature-change-button')).toBeInTheDocument();
  });

  it('TC-SET-003 썸네일이 null이면 원본 이미지를 쓴다', async () => {
    await openSettings({ routes: { signature: [fx('signature/users-me-signature__get-thumbnail-null.json')] } });
    expect(await screen.findByTestId('settings.signature-image')).toHaveAttribute('src', SIGNATURE_URL.original);
  });

  it('TC-SET-013 설정 진입 시 GET /users/me/signature를 Bearer 헤더로 한 번 보낸다', async () => {
    const { h } = await openSettings();
    await screen.findByTestId('settings.signature-image');
    const calls = h.ff.callsTo(CARD_GET);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers['authorization']).toBe('Bearer fixture-access-token-1');
  });

  it('TC-SET-003 조회 중에는 settings.signature-loading을 보이고 끝나면 사라진다', async () => {
    const gate = deferred<Response>();
    const { h } = await openSettings({ routes: { signature: [() => gate.promise] } });
    expect(await screen.findByTestId('settings.signature-loading')).toBeInTheDocument();
    gate.resolve(resp('signature/users-me-signature__get-success.json'));
    await screen.findByTestId('settings.signature-image');
    expect(screen.queryByTestId('settings.signature-loading')).not.toBeInTheDocument();
    expect(h.ff.callsTo(CARD_GET)).toHaveLength(1);
  });

  it('TC-SET-006 최초 조회가 실패하면 "사인을 불러오지 못했어요. 다시 시도해 주세요."와 다시 불러오기 버튼이 보이고, 누르면 재조회한다', async () => {
    const err = fx('signature/users-me-signature__get-internal-error.json');
    const { h } = await openSettings({ routes: { signature: [err, err, err, fx('signature/users-me-signature__get-success.json')] } });
    await settle(h);
    expect(await screen.findByTestId('settings.signature-error')).toHaveTextContent('사인을 불러오지 못했어요. 다시 시도해 주세요.');
    expect(screen.queryByTestId('settings.signature-image')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings.signature-retry-button'));
    expect(await screen.findByTestId('settings.signature-image')).toBeInTheDocument();
    expect(screen.queryByTestId('settings.signature-error')).not.toBeInTheDocument();
    expect(h.ff.callsTo(CARD_GET)).toHaveLength(4);
  });

  it('TC-SET-007 재시도 버튼을 연타해도 진행 중에는 중복 요청이 나가지 않는다', async () => {
    const err = fx('signature/users-me-signature__get-internal-error.json');
    const gate = deferred<Response>();
    const { h } = await openSettings({ routes: { signature: [err, err, err, () => gate.promise] } });
    await settle(h);
    const retry = await screen.findByTestId('settings.signature-retry-button');
    fireEvent.click(retry);
    fireEvent.click(retry);
    fireEvent.click(retry);
    expect(h.ff.callsTo(CARD_GET)).toHaveLength(4);
    gate.resolve(resp('signature/users-me-signature__get-success.json'));
    await screen.findByTestId('settings.signature-image');
  });

  it('TC-SET-004 설정을 다시 열면 기존 사인을 그대로 보이면서(로딩 표시 없음) 재조회하고 응답이 오면 교체한다', async () => {
    let hold: ReturnType<typeof deferred<Response>> | null = null;
    const responder = () => (hold ? hold.promise : resp('signature/users-me-signature__get-success.json'));
    await openSettings({ routes: { signature: [responder] } });
    await screen.findByTestId('settings.signature-image');
    fireEvent.click(screen.getByTestId('bottom-bar.tab-display'));
    await screen.findByTestId('display.root');
    hold = deferred<Response>();
    fireEvent.click(screen.getByTestId('bottom-bar.tab-settings'));
    expect(await screen.findByTestId('settings.signature-image')).toHaveAttribute('src', SIGNATURE_URL.thumbnail);
    expect(screen.queryByTestId('settings.signature-loading')).not.toBeInTheDocument();
    hold.resolve(resp('signature/users-me-signature__get-thumbnail-null.json'));
    await waitFor(() => expect(screen.getByTestId('settings.signature-image')).toHaveAttribute('src', SIGNATURE_URL.original));
  });

  it('TC-SET-004 REQ-SET-004 설정 탭을 다시 열 때마다 사인(GET)과 푸시 설정(GET)을 다시 조회한다', async () => {
    const { h } = await openSettings();
    await screen.findByTestId('settings.signature-image');
    fireEvent.click(screen.getByTestId('bottom-bar.tab-display'));
    await screen.findByTestId('display.root');
    fireEvent.click(screen.getByTestId('bottom-bar.tab-settings'));
    await screen.findByTestId('settings.root');
    await waitFor(() => expect(h.ff.callsTo(CARD_GET)).toHaveLength(2));
    await waitFor(() => expect(h.ff.callsTo(SETTINGS_GET)).toHaveLength(2));
  });

  it('TC-SET-005 이미 사인이 보일 때 재조회가 실패하면 기존 사인을 유지하고 토스트 sign.load.error를 보인다', async () => {
    const err = fx('signature/users-me-signature__get-internal-error.json');
    const { h, toasts } = await openSettings({ routes: { signature: [fx('signature/users-me-signature__get-success.json'), err] } });
    await screen.findByTestId('settings.signature-image');
    fireEvent.click(screen.getByTestId('bottom-bar.tab-display'));
    await screen.findByTestId('display.root');
    fireEvent.click(screen.getByTestId('bottom-bar.tab-settings'));
    await screen.findByTestId('settings.root');
    await settle(h);
    expect(screen.getByTestId('settings.signature-image')).toHaveAttribute('src', SIGNATURE_URL.thumbnail);
    expect(screen.queryByTestId('settings.signature-error')).not.toBeInTheDocument();
    expect(toasts.messages).toContain(t('sign.load.error'));
  });

  it('TC-SET-012 사인 조회가 REAUTHENTICATION_REQUIRED(401)면 로그인 화면으로 간다', async () => {
    const { h, router } = await openSettings({ routes: { signature: [fx('signature/users-me-signature__get-unauthorized.json')] } });
    h.ff.route('POST /auth/refresh', fx('auth/refresh__reauthentication-required.json'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('TC-SET-050 "변경하기"를 누르면 사인 변경 화면으로 push하고(설정이 아래에 쌓임) 뒤로 가면 설정으로 돌아온다', async () => {
    const { router } = await openSettings();
    fireEvent.click(await screen.findByTestId('settings.signature-change-button'));
    await screen.findByTestId('signature.root');
    expect(router.state.location.pathname).toBe('/settings/signature');
    expect(router.state.location.state).toEqual(SETTINGS_BELOW_STATE);
    expect(router.state.historyAction).toBe('PUSH');
    await act(async () => router.navigate(-1));
    expect(await screen.findByTestId('settings.root')).toBeInTheDocument();
  });

  it('TC-SIGN-040 가입 정보에 사인이 없는(SIGNATURE_REGISTRATION_REQUIRED) 경우에도 오류 문구 없이 "변경하기"로 등록할 수 있다', async () => {
    await openSettings({ routes: { signature: [fx('signature/users-me-signature__get-registration-required.json')] } });
    expect(await screen.findByTestId('settings.signature-change-button')).toBeInTheDocument();
    expect(screen.queryByTestId('settings.signature-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings.signature-image')).not.toBeInTheDocument();
  });
});

describe('피드백·약관·버전 행', () => {
  it('TC-SET-050 TC-FDBK-001 "피드백 보내기"를 누르면 피드백 화면을 push로 열고(설정이 아래에 쌓임) 뒤로 가기로 설정에 돌아온다', async () => {
    const { router } = await openSettings();
    fireEvent.click(screen.getByTestId('settings.feedback-row'));
    await screen.findByTestId('feedback.root');
    expect(router.state.location.pathname).toBe('/feedback');
    expect(router.state.location.state).toEqual(SETTINGS_BELOW_STATE);
    expect(router.state.historyAction).toBe('PUSH');
    expect(screen.queryByTestId('bottom-bar.root')).not.toBeInTheDocument();
    await act(async () => router.navigate(-1));
    expect(await screen.findByTestId('settings.root')).toBeInTheDocument();
  });

  it('TC-SET-047 REQ-SET-006 이용약관과 개인정보처리방침은 각각 해당 문서를 새 탭으로 연다(설정 화면은 유지)', async () => {
    const { h, router } = await openSettings();
    fireEvent.click(screen.getByTestId('settings.terms-row'));
    fireEvent.click(screen.getByTestId('settings.privacy-row'));
    expect(h.opener.opened).toEqual([TERMS_URLS.service, TERMS_URLS.privacy]);
    expect(router.state.location.pathname).toBe('/settings');
    expect(screen.queryByTestId('legal-doc.open-failed-message')).not.toBeInTheDocument();
  });

  it('TC-SET-047 D-22 Web은 문서를 새 탭으로 열므로 앱 안 화면이 없어 screen_view privacy_policy, terms_of_service를 보내지 않는다(TermsScreen과 같은 임시 결정)', async () => {
    const { h } = await openSettings();
    fireEvent.click(screen.getByTestId('settings.terms-row'));
    fireEvent.click(screen.getByTestId('settings.privacy-row'));
    expect(screenViews(h.tracker)).not.toContain('terms_of_service');
    expect(screenViews(h.tracker)).not.toContain('privacy_policy');
  });

  it.each([[false], ['throw' as const]])('TC-SET-048 REQ-ONB-009 새 탭을 열지 못하면(%s) "문서를 열 수 없어요"를 보이고, 다시 열기에 성공하면 지운다', async (result) => {
    const { h } = await openSettings();
    h.opener.result = result;
    fireEvent.click(screen.getByTestId('settings.terms-row'));
    expect(await screen.findByTestId('legal-doc.open-failed-message')).toHaveTextContent('문서를 열 수 없어요');
    h.opener.result = true;
    fireEvent.click(screen.getByTestId('settings.terms-row'));
    expect(screen.queryByTestId('legal-doc.open-failed-message')).not.toBeInTheDocument();
  });

  it('TC-SET-049 REQ-SET-005 버전정보 행은 빌드 버전 문자열을 접두 없이 값으로 보인다', async () => {
    await openSettings({ version: '1.2.3' });
    expect(screen.getByTestId('settings.version-value')).toHaveTextContent(/^1\.2\.3$/);
    expect(screen.getByTestId('settings.version-row')).toContainElement(screen.getByTestId('settings.version-value'));
  });

  it('REQ-SET-005 버전정보 행을 눌러도 아무 동작이 없다(이동·문서 열기·토스트·요청 없음)', async () => {
    const { h, router } = await openSettings({ version: '1.2.3' });
    await screen.findByTestId('settings.signature-image');
    const requests = h.ff.calls.length;
    fireEvent.click(screen.getByTestId('settings.version-row'));
    fireEvent.click(screen.getByTestId('settings.version-value'));
    expect(router.state.location.pathname).toBe('/settings');
    expect(h.opener.opened).toEqual([]);
    expect(toastText()).toBeNull();
    expect(h.ff.calls).toHaveLength(requests);
    expect(screen.queryByTestId('settings.logout-dialog')).not.toBeInTheDocument();
  });
});

describe('오프라인 (TC-SET-051)', () => {
  it('사인·푸시 설정은 각각 오류 상태이고 계정, 피드백, 약관, 버전 행은 정상 동작한다', async () => {
    const h = makeHarness({ session: memberSession(), appVersion: '1.2.3' });
    routeSettings(h.ff, { signature: [networkFailure], get: [networkFailure] });
    renderApp(h.container, '/settings');
    await screen.findByTestId('settings.root');
    await settle(h);
    expect(await screen.findByTestId('settings.signature-error')).toBeInTheDocument();
    expect(screen.getByTestId('settings.push-error')).toBeInTheDocument();
    for (const id of ['settings.logout-row', 'settings.withdraw-row', 'settings.feedback-row', 'settings.privacy-row', 'settings.terms-row']) {
      expect(screen.getByTestId(id)).toBeEnabled();
    }
    expect(screen.getByTestId('settings.version-value')).toHaveTextContent('1.2.3');
    fireEvent.click(screen.getByTestId('settings.terms-row'));
    expect(h.opener.opened).toEqual([TERMS_URLS.service]);
    fireEvent.click(screen.getByTestId('settings.logout-row'));
    expect(await screen.findByTestId('settings.logout-dialog')).toBeInTheDocument();
  });
});

describe('설정 탭 (게스트)', () => {
  it('TC-SET-008 REQ-SET-002 게스트는 "로그인" 버튼만 보이고 사인·푸시·계정·피드백·약관 행은 없으며 API를 한 번도 부르지 않는다', async () => {
    const { h } = await openSettings({ session: guestSession });
    expect(await screen.findByTestId('settings.login-button')).toHaveTextContent('로그인');
    for (const id of ['settings.signature-card', 'settings.push-section', 'settings.logout-row', 'settings.withdraw-row', 'settings.feedback-row', 'settings.privacy-row', 'settings.terms-row', 'settings.version-row']) {
      expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    }
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(h.ff.calls).toHaveLength(0);
  });

  it('REQ-NAV-020 게스트가 "로그인"을 누르면 게스트 플래그를 지우고 로그인 화면으로 이동하며 설정으로 되돌아오지 않는다', async () => {
    const { h, router } = await openSettings({ session: guestSession });
    fireEvent.click(await screen.findByTestId('settings.login-button'));
    await screen.findByTestId('login.root');
    expect(await h.store.read()).toEqual(EMPTY_SESSION);
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('TC-SET-052 게스트도 설정이 보이면 screen_view settings가 한 번 전송된다', async () => {
    const { h } = await openSettings({ session: guestSession, strict: true });
    await screen.findByTestId('settings.login-button');
    expect(screenViews(h.tracker).filter((name) => name === 'settings')).toEqual(['settings']);
  });

  it('TC-FDBK-035 REQ-FDBK-001 게스트가 URL로 피드백에 들어오면 화면 없이 홈으로 보내고 토스트 nav.guest.feedback을 보이며 요청이 없다', async () => {
    const h = makeHarness({ session: guestSession });
    const view = renderApp(h.container, '/feedback');
    await screen.findByTestId('home.root');
    expect(view.path()).toBe('/home');
    expect(toastText()).toBe(t('nav.guest.feedback'));
    expect(screen.queryByTestId('feedback.root')).not.toBeInTheDocument();
    expect(h.ff.callsTo('POST /feedbacks')).toHaveLength(0);
  });
});

describe('푸시 설정 API는 설정 탭에서만 (TC-SET-052 주변)', () => {
  it('설정 진입 직후 PATCH는 한 번도 보내지 않는다', async () => {
    const { h } = await openSettings();
    await screen.findByTestId('settings.signature-image');
    expect(h.ff.callsTo(SETTINGS_PATCH)).toHaveLength(0);
  });
});
