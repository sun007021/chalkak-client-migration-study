import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { t } from '../../copy/ko';
import { EMPTY_SESSION } from '../../core/auth/SessionStore';
import { makeHarness, renderApp } from '../../test/appHarness';
import { deferred } from '../../test/deferred';
import { loadFixture, memberSession } from '../../test/fixtures';
import { recordToasts } from '../../test/toastLog';
import type { Responder } from '../../test/fakeFetch';
import { PUSH_TOGGLE_IDS, fx, resp, routeSettings, toastText } from '../../test/settingsHarness';

const LOGOUT = 'POST /auth/logout';
const WITHDRAW = 'DELETE /users/me';
const logoutOk = () => loadFixture('auth/logout__no-content.json').toResponse();
const deleteOk = () => loadFixture('auth/users-me__delete-no-content.json').toResponse();

async function openAccount(o: { logout?: Responder } = {}) {
  const h = makeHarness({ session: memberSession() });
  routeSettings(h.ff);
  h.ff.route(LOGOUT, o.logout ?? logoutOk);
  h.ff.route(WITHDRAW, deleteOk);
  const toasts = recordToasts(h.container.toast);
  const view = renderApp(h.container, '/settings');
  await screen.findByTestId('settings.root');
  await screen.findByTestId('settings.signature-image');
  await waitFor(() => expect(screen.getByTestId(PUSH_TOGGLE_IDS.topicPushEnabled)).toBeEnabled());
  return { h, toasts, ...view };
}
const row = (name: 'logout' | 'withdraw') => screen.getByTestId(name === 'logout' ? 'settings.logout-row' : 'settings.withdraw-row');
const dialogIds = {
  logout: { dialog: 'settings.logout-dialog', confirm: 'settings.logout-confirm-button', cancel: 'settings.logout-cancel-button' },
  withdraw: { dialog: 'settings.withdraw-dialog', confirm: 'settings.withdraw-confirm-button', cancel: 'settings.withdraw-cancel-button' },
} as const;
const pick = (name: 'logout' | 'withdraw', part: 'dialog' | 'confirm' | 'cancel') => screen.getByTestId(dialogIds[name][part]);
async function openDialog(name: 'logout' | 'withdraw') {
  fireEvent.click(row(name));
  return screen.findByTestId(dialogIds[name].dialog);
}
const settle = (h: Awaited<ReturnType<typeof openAccount>>['h']) => act(async () => void (await h.clock.advance(5_000)));

describe('확인 대화상자 구성', () => {
  it('TC-SET-041 로그아웃 행: "정말 로그아웃 하시겠습니까?"와 확인/취소가 있다', async () => {
    await openAccount();
    const dialog = await openDialog('logout');
    expect(dialog).toHaveAttribute('role', 'alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('정말 로그아웃 하시겠습니까?');
    expect(pick('logout', 'confirm')).toHaveTextContent('로그아웃');
    expect(pick('logout', 'cancel')).toHaveTextContent('취소');
    expect(screen.queryByTestId('settings.withdraw-dialog')).not.toBeInTheDocument();
  });

  it('TC-SET-044 회원탈퇴 행: "정말 회원탈퇴 하시겠습니까?"와 확인/취소가 있다', async () => {
    await openAccount();
    const dialog = await openDialog('withdraw');
    expect(dialog).toHaveAttribute('role', 'alertdialog');
    expect(dialog).toHaveAccessibleName('정말 회원탈퇴 하시겠습니까?');
    expect(pick('withdraw', 'confirm')).toHaveTextContent('회원탈퇴');
    expect(pick('withdraw', 'cancel')).toHaveTextContent('취소');
  });

  it('TC-SET-041 로그아웃과 회원탈퇴 다이얼로그는 문구와 강조 방식이 구분된다(탈퇴 확인 버튼만 data-emphasis="destructive", 임시)', async () => {
    await openAccount();
    await openDialog('logout');
    expect(pick('logout', 'confirm')).not.toHaveAttribute('data-emphasis', 'destructive');
    fireEvent.click(pick('logout', 'cancel'));
    await openDialog('withdraw');
    expect(pick('withdraw', 'confirm')).toHaveAttribute('data-emphasis', 'destructive');
    expect(pick('withdraw', 'dialog')).not.toHaveTextContent('정말 로그아웃');
  });
});

describe('확인 대화상자 접근성 (useDialogFocus)', () => {
  it.each(['logout', 'withdraw'] as const)('%s: 열리면 처음 포커스는 되돌릴 수 없는 확인이 아니라 취소 버튼에 간다', async (name) => {
    await openAccount();
    await openDialog(name);
    expect(pick(name, 'cancel')).toHaveFocus();
  });

  it.each(['logout', 'withdraw'] as const)('%s: Tab/Shift+Tab은 대화상자 안에서만 돈다', async (name) => {
    await openAccount();
    await openDialog(name);
    const user = userEvent.setup();
    expect(pick(name, 'cancel')).toHaveFocus();
    await user.tab();
    expect(pick(name, 'confirm')).toHaveFocus();
    await user.tab();
    expect(pick(name, 'cancel')).toHaveFocus();
    await user.tab({ shift: true });
    expect(pick(name, 'confirm')).toHaveFocus();
  });

  it.each(['logout', 'withdraw'] as const)('%s: 열려 있는 동안 배경(설정 행)은 inert이고 닫히면 풀린다', async (name) => {
    await openAccount();
    await openDialog(name);
    expect(row('logout').closest('[inert]')).not.toBeNull();
    expect(screen.getByTestId('settings.feedback-row').closest('[inert]')).not.toBeNull();
    fireEvent.click(pick(name, 'cancel'));
    await waitFor(() => expect(screen.queryByTestId(dialogIds[name].dialog)).not.toBeInTheDocument());
    expect(row('logout').closest('[inert]')).toBeNull();
  });

  it.each(['logout', 'withdraw'] as const)('%s: Esc로 닫으면(취소와 같다) 호출 없이 닫히고 포커스가 처음 누른 행으로 돌아온다', async (name) => {
    const { h } = await openAccount();
    row(name).focus();
    await openDialog(name);
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId(dialogIds[name].dialog)).not.toBeInTheDocument());
    expect(row(name)).toHaveFocus();
    expect(h.ff.callsTo(LOGOUT)).toHaveLength(0);
    expect(h.ff.callsTo(WITHDRAW)).toHaveLength(0);
  });

  it('취소 버튼으로 닫아도 포커스는 행으로 돌아온다', async () => {
    await openAccount();
    row('logout').focus();
    await openDialog('logout');
    fireEvent.click(pick('logout', 'cancel'));
    await waitFor(() => expect(screen.queryByTestId('settings.logout-dialog')).not.toBeInTheDocument());
    expect(row('logout')).toHaveFocus();
  });
});

describe('로그아웃', () => {
  it('TC-SET-042 REQ-AUTH-032 취소하면 API 호출이 0건이고 설정 화면과 세션이 유지된다', async () => {
    const { h, router } = await openAccount();
    await openDialog('logout');
    const requests = h.ff.calls.length;
    fireEvent.click(pick('logout', 'cancel'));
    await waitFor(() => expect(screen.queryByTestId('settings.logout-dialog')).not.toBeInTheDocument());
    expect(h.ff.calls).toHaveLength(requests);
    expect(h.ff.callsTo(LOGOUT)).toHaveLength(0);
    expect(router.state.location.pathname).toBe('/settings');
    expect((await h.store.read()).tokens).not.toBeNull();
  });

  it('TC-SET-043 REQ-AUTH-033 확인하면 로컬 세션을 지우고 POST /auth/logout {refreshToken}(Authorization 없음)을 보내며 로그인 화면으로 이동한다', async () => {
    const { h, router } = await openAccount();
    await openDialog('logout');
    fireEvent.click(pick('logout', 'confirm'));
    await screen.findByTestId('login.root');
    expect(router.state.location.pathname).toBe('/login');
    expect(await h.store.read()).toEqual(EMPTY_SESSION);
    await waitFor(() => expect(h.ff.callsTo(LOGOUT)).toHaveLength(1));
    const [call] = h.ff.callsTo(LOGOUT);
    expect(JSON.parse(call!.body as string)).toEqual({ refreshToken: 'fixture-refresh-token-1' });
    expect(call!.headers['authorization']).toBeUndefined();
    expect(screen.queryByTestId('settings.root')).not.toBeInTheDocument();
  });

  it('TC-SET-043 로그아웃 요청이 실패(500)해도 무시하고 로그인 화면으로 간다', async () => {
    const { h } = await openAccount({ logout: fx('auth/logout__internal-error.json') });
    await openDialog('logout');
    fireEvent.click(pick('logout', 'confirm'));
    await screen.findByTestId('login.root');
    await waitFor(() => expect(h.ff.callsTo(LOGOUT)).toHaveLength(1));
    expect(toastText()).toBeNull();
    expect(await h.store.read()).toEqual(EMPTY_SESSION);
  });

  it('REQ-AUTH-040 확인을 연타해도 로그아웃 요청은 한 번이다', async () => {
    const { h } = await openAccount();
    await openDialog('logout');
    const confirm = pick('logout', 'confirm');
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await screen.findByTestId('login.root');
    await settle(h);
    expect(h.ff.callsTo(LOGOUT)).toHaveLength(1);
  });

  it('REQ-SET-020 TC-SET-037 로그아웃하면 사인 카드·푸시 설정·업로드 결과 등 사용자 캐시가 모두 비워진다', async () => {
    const { h } = await openAccount();
    expect(h.container.signatureCard.state.status).toBe('content');
    expect(h.container.notificationSettings.state.status).toBe('ready');
    await openDialog('logout');
    fireEvent.click(pick('logout', 'confirm'));
    await screen.findByTestId('login.root');
    expect(h.container.signatureCard.state).toEqual({ status: 'idle', imageUrl: null });
    expect(h.container.notificationSettings.state).toMatchObject({ status: 'idle', values: null });
  });
});

describe('회원탈퇴', () => {
  it('TC-SET-045 REQ-AUTH-037 취소하면 DELETE 호출이 0건이다', async () => {
    const { h, router } = await openAccount();
    await openDialog('withdraw');
    fireEvent.click(pick('withdraw', 'cancel'));
    await waitFor(() => expect(screen.queryByTestId('settings.withdraw-dialog')).not.toBeInTheDocument());
    expect(h.ff.callsTo(WITHDRAW)).toHaveLength(0);
    expect(router.state.location.pathname).toBe('/settings');
    expect((await h.store.read()).tokens).not.toBeNull();
  });

  it('TC-SET-046 REQ-AUTH-038 성공(204)이면 세션·캐시를 지우고 로그인 화면으로 이동한다. 요청은 DELETE /users/me 본문 없음이다', async () => {
    const { h, router } = await openAccount();
    await openDialog('withdraw');
    fireEvent.click(pick('withdraw', 'confirm'));
    await screen.findByTestId('login.root');
    expect(router.state.location.pathname).toBe('/login');
    const [call] = h.ff.callsTo(WITHDRAW);
    expect(call!.body).toBeNull();
    expect(call!.headers['authorization']).toBe('Bearer fixture-access-token-1');
    expect(await h.store.read()).toEqual(EMPTY_SESSION);
    expect(h.container.signatureCard.state.status).toBe('idle');
    expect(h.container.notificationSettings.state.status).toBe('idle');
  });

  it('TC-SET-046 REQ-AUTH-039 실패(500)하면 세션을 유지하고 설정에 머무르며 토스트 "요청을 처리하지 못했어요. 다시 시도해 주세요."를 보이고 대화상자는 닫힌다', async () => {
    const h = makeHarness({ session: memberSession() });
    routeSettings(h.ff);
    h.ff.route(WITHDRAW, fx('auth/users-me__delete-internal-error.json'));
    const toasts = recordToasts(h.container.toast);
    const { router } = renderApp(h.container, '/settings');
    await screen.findByTestId('settings.signature-image');
    await openDialog('withdraw');
    fireEvent.click(pick('withdraw', 'confirm'));
    await settle(h); // DELETE는 멱등이라 가짜 시계로 재시도 대기(0.5초, 1초)를 넘긴다
    await waitFor(() => expect(toasts.messages).toEqual([t('auth.withdraw.error')]));
    await waitFor(() => expect(screen.queryByTestId('settings.withdraw-dialog')).not.toBeInTheDocument());
    expect(toasts.messages[0]).toBe('요청을 처리하지 못했어요. 다시 시도해 주세요.');
    expect(router.state.location.pathname).toBe('/settings');
    expect((await h.store.read()).tokens).not.toBeNull();
    expect(h.container.signatureCard.state.status).toBe('content');
  });

  it('TC-SET-046 실패한 뒤 다시 회원탈퇴를 눌러 재시도할 수 있다', async () => {
    const h = makeHarness({ session: memberSession() });
    routeSettings(h.ff);
    // 멱등 DELETE는 500을 3번(최초 + 재시도 2회) 받아야 실패로 끝난다. 그 뒤 두 번째 시도가 성공한다.
    const serverError = fx('auth/users-me__delete-internal-error.json');
    h.ff.route(WITHDRAW, serverError, serverError, serverError, fx('auth/users-me__delete-no-content.json'));
    renderApp(h.container, '/settings');
    await screen.findByTestId('settings.signature-image');
    await openDialog('withdraw');
    fireEvent.click(pick('withdraw', 'confirm'));
    await settle(h); // 멱등 DELETE의 재시도 대기를 가짜 시계로 넘긴다
    await waitFor(() => expect(screen.queryByTestId('settings.withdraw-dialog')).not.toBeInTheDocument());
    await openDialog('withdraw');
    fireEvent.click(pick('withdraw', 'confirm'));
    await screen.findByTestId('login.root');
  });

  it('REQ-AUTH-040 처리 중에는 확인 버튼이 비활성이고 Esc·취소로 닫히지 않으며 DELETE는 한 번이다', async () => {
    const h = makeHarness({ session: memberSession() });
    routeSettings(h.ff);
    const gate = deferred<Response>();
    h.ff.route(WITHDRAW, () => gate.promise);
    renderApp(h.container, '/settings');
    await screen.findByTestId('settings.signature-image');
    await openDialog('withdraw');
    fireEvent.click(pick('withdraw', 'confirm'));
    await waitFor(() => expect(pick('withdraw', 'confirm')).toBeDisabled());
    fireEvent.click(pick('withdraw', 'confirm'));
    await userEvent.setup().keyboard('{Escape}');
    expect(screen.getByTestId('settings.withdraw-dialog')).toBeInTheDocument();
    gate.resolve(resp('auth/users-me__delete-no-content.json'));
    await screen.findByTestId('login.root');
    expect(h.ff.callsTo(WITHDRAW)).toHaveLength(1);
  });

  it('REQ-AUTH-046 정지 회원도 같은 흐름이다(별도 분기·안내 없음)', async () => {
    const { h } = await openAccount();
    await openDialog('withdraw');
    fireEvent.click(pick('withdraw', 'confirm'));
    await screen.findByTestId('login.root');
    expect(h.ff.callsTo(WITHDRAW)).toHaveLength(1);
  });
});

describe('확인 대화상자 겹침 (하단 바 위)', () => {
  it.each(['logout', 'withdraw'] as const)('%s: 오버레이가 하단 바(zIndex 100)보다 위(200)에 있다', async (name) => {
    await openAccount();
    const dialog = await openDialog(name);
    expect(dialog.parentElement).toHaveStyle({ zIndex: '200' });
    expect(Number(screen.getByTestId('bottom-bar.root').style.zIndex)).toBeLessThan(200);
  });
});
