import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { makeHarness, renderApp } from '../test/appHarness';
import type { Harness } from '../test/appHarness';
import { deferred } from '../test/deferred';
import { OTHER_USER, memberSession, tokens } from '../test/fixtures';
import { PUSH_TOGGLE_IDS, SETTINGS_GET, SETTINGS_PATCH, SIGNATURE_URL, fx, isDisabled, isOn, pushToggle, resp, routeSettings } from '../test/settingsHarness';
import { CARD_GET } from '../test/signatureRoutes';
import { recordToasts } from '../test/toastLog';

import { advanceClock } from '../test/settle';
const otherSession = () => ({ userId: OTHER_USER, tokens: tokens({ accessToken: 'fixture-access-token-2', refreshToken: 'fixture-refresh-token-2' }), isGuest: false });

/** A 계정으로 설정을 열고, 로그아웃해 로그인 화면까지 간다. */
async function logoutFromSettings(h: Harness) {
  h.ff.route('POST /auth/logout', fx('auth/logout__no-content.json'));
  fireEvent.click(await screen.findByTestId('settings.logout-row'));
  fireEvent.click(await screen.findByTestId('settings.logout-confirm-button'));
  await screen.findByTestId('login.root');
}
/** 로그인 화면에서 다른 계정으로 로그인했다고 보고(세션 저장) 설정 탭을 연다. */
async function signInAsOther(h: Harness, router: ReturnType<typeof renderApp>['router']) {
  await h.store.write(otherSession());
  await act(async () => router.navigate('/settings'));
}

describe('계정 전환 (로그아웃 → 다른 계정) — 설정', () => {
  it('TC-SET-037 REQ-SET-020 이전 계정의 사인·푸시 설정이 새 계정 화면에 보이지 않고, 새 계정으로 다시 조회한다', async () => {
    const h = makeHarness({ session: memberSession() });
    const gate = deferred<Response>();
    const cardGate = deferred<Response>();
    routeSettings(h.ff, {
      signature: [fx('signature/users-me-signature__get-success.json'), () => cardGate.promise],
      get: [fx('settings/notification-settings__get-topic-off.json'), () => gate.promise],
    });
    const { router } = renderApp(h.container, '/settings');
    await waitFor(() => expect(isDisabled(pushToggle('topicPushEnabled'))).toBe(false));
    expect(isOn(pushToggle('topicPushEnabled'))).toBe(false); // A 계정은 주제 알림 꺼짐
    await screen.findByTestId('settings.signature-image');
    await logoutFromSettings(h);

    await signInAsOther(h, router);
    await screen.findByTestId('settings.root');
    // 새 계정 응답 전에는 A의 값도 사인도 보이지 않는다(스위치는 비활성, 사인은 로딩).
    for (const id of Object.values(PUSH_TOGGLE_IDS)) expect(screen.getByTestId(id)).toBeDisabled();
    expect(screen.queryByTestId('settings.signature-image')).not.toBeInTheDocument();
    gate.resolve(resp('settings/notification-settings__get-all-true.json'));
    cardGate.resolve(resp('signature/users-me-signature__get-thumbnail-null.json'));
    await waitFor(() => expect(isOn(pushToggle('topicPushEnabled'))).toBe(true));
    expect(await screen.findByTestId('settings.signature-image')).toHaveAttribute('src', SIGNATURE_URL.original);
    expect(h.ff.callsTo(SETTINGS_GET)).toHaveLength(2);
    expect(h.ff.callsTo(CARD_GET)).toHaveLength(2);
    expect(h.ff.callsTo(SETTINGS_GET)[1]!.headers['authorization']).toBe('Bearer fixture-access-token-2');
  });

  it('TC-SET-032 로그아웃 전에 시작한 푸시 설정 조회 응답이 새 계정 설정이 열린 뒤 늦게 도착해도 새 계정 값을 덮어쓰지 않는다', async () => {
    const h = makeHarness({ session: memberSession() });
    const lateA = deferred<Response>();
    routeSettings(h.ff, { get: [() => lateA.promise, fx('settings/notification-settings__get-topic-off.json')] });
    h.ff.route('POST /auth/logout', fx('auth/logout__no-content.json'));
    const { router } = renderApp(h.container, '/settings');
    await screen.findByTestId('settings.signature-image');
    await logoutFromSettings(h);
    await signInAsOther(h, router);
    await waitFor(() => expect(isDisabled(pushToggle('topicPushEnabled'))).toBe(false));
    expect(isOn(pushToggle('topicPushEnabled'))).toBe(false); // B 계정: 주제 알림 꺼짐
    lateA.resolve(resp('settings/notification-settings__get-all-true.json')); // A의 늦은 응답(모두 켜짐)
    await advanceClock(h, 1_000);
    expect(isOn(pushToggle('topicPushEnabled'))).toBe(false);
  });

  it('TC-SET-031 저장 도중 로그아웃하면 이전 계정의 저장 실패 응답이 새 계정 화면에 되돌리기·토스트를 일으키지 않는다', async () => {
    const h = makeHarness({ session: memberSession() });
    const patchGate = deferred<Response>();
    routeSettings(h.ff, { get: [fx('settings/notification-settings__get-all-true.json')], patch: [() => patchGate.promise] });
    const toasts = recordToasts(h.container.toast);
    const { router } = renderApp(h.container, '/settings');
    await waitFor(() => expect(isDisabled(pushToggle('topicPushEnabled'))).toBe(false));
    fireEvent.click(pushToggle('topicPushEnabled'));
    await waitFor(() => expect(h.ff.callsTo(SETTINGS_PATCH)).toHaveLength(1));
    await logoutFromSettings(h);
    await signInAsOther(h, router);
    await waitFor(() => expect(isDisabled(pushToggle('topicPushEnabled'))).toBe(false));
    patchGate.resolve(resp('settings/notification-settings__patch-internal-error.json'));
    await advanceClock(h, 5_000);
    expect(isOn(pushToggle('topicPushEnabled'))).toBe(true);
    expect(toasts.messages).toEqual([]);
  });

  it('REQ-SET-020 회원탈퇴 뒤에도 같은 방식으로 이전 계정 값을 남기지 않는다', async () => {
    const h = makeHarness({ session: memberSession() });
    routeSettings(h.ff, { get: [fx('settings/notification-settings__get-ai-off.json'), fx('settings/notification-settings__get-all-true.json')] });
    h.ff.route('DELETE /users/me', fx('auth/users-me__delete-no-content.json'));
    const { router } = renderApp(h.container, '/settings');
    await waitFor(() => expect(isDisabled(pushToggle('aiReviewPushEnabled'))).toBe(false));
    expect(isOn(pushToggle('aiReviewPushEnabled'))).toBe(false);
    fireEvent.click(screen.getByTestId('settings.withdraw-row'));
    fireEvent.click(await screen.findByTestId('settings.withdraw-confirm-button'));
    await screen.findByTestId('login.root');
    expect(h.container.notificationSettings.state).toMatchObject({ status: 'idle', values: null });
    await signInAsOther(h, router);
    await waitFor(() => expect(isDisabled(pushToggle('aiReviewPushEnabled'))).toBe(false));
    expect(isOn(pushToggle('aiReviewPushEnabled'))).toBe(true);
  });
});
