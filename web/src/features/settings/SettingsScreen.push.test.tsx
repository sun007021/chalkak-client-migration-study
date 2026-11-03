import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { t } from '../../copy/ko';
import { makeHarness, renderApp } from '../../test/appHarness';
import type { Harness } from '../../test/appHarness';
import { deferred } from '../../test/deferred';
import { memberSession } from '../../test/fixtures';
import { recordToasts } from '../../test/toastLog';
import { SETTINGS_GET, SETTINGS_PATCH, fx, isDisabled, isOn, patchBodies, pushToggle, resp, routeSettings } from '../../test/settingsHarness';
import type { PushSettingKey } from './NotificationSettingsRepository';

type RouteOptions = Parameters<typeof routeSettings>[1];

async function openPush(routes?: RouteOptions) {
  const h = makeHarness({ session: memberSession() });
  routeSettings(h.ff, routes);
  const toasts = recordToasts(h.container.toast);
  const view = renderApp(h.container, '/settings');
  await screen.findByTestId('settings.root');
  return { h, toasts, ...view };
}
async function openReady(routes?: RouteOptions) {
  const ctx = await openPush(routes);
  await waitFor(() => expect(isDisabled(pushToggle('topicPushEnabled'))).toBe(false));
  return ctx;
}
const settle = (h: Harness) => act(async () => void (await h.clock.advance(5_000)));
const KEYS: PushSettingKey[] = ['topicPushEnabled', 'moderationPushEnabled', 'aiReviewPushEnabled'];

describe('푸시 알림 섹션 구성 (Web은 서버 설정에만 연결, REQ-SET-019)', () => {
  it('TC-SET-018 REQ-SET-009 스위치 3개의 라벨은 "오늘 주제 알림", "게시물 승인·반려 알림", "AI 피드백 완료 알림"이고 상태가 서버 값과 같다(role=switch + aria-checked)', async () => {
    await openReady();
    expect(screen.getByTestId('settings.push-section')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '오늘 주제 알림' })).toBe(pushToggle('topicPushEnabled'));
    expect(screen.getByRole('switch', { name: '게시물 승인·반려 알림' })).toBe(pushToggle('moderationPushEnabled'));
    expect(screen.getByRole('switch', { name: 'AI 피드백 완료 알림' })).toBe(pushToggle('aiReviewPushEnabled'));
    expect(screen.getAllByRole('switch')).toHaveLength(3);
    for (const key of KEYS) expect(isOn(pushToggle(key))).toBe(true);
  });

  it('TC-SET-014 TC-SET-018 서버가 꺼 둔 항목은 꺼진 채로 보인다', async () => {
    await openReady({ get: [fx('settings/notification-settings__get-ai-off.json')] });
    expect(isOn(pushToggle('aiReviewPushEnabled'))).toBe(false);
    expect(isOn(pushToggle('topicPushEnabled'))).toBe(true);
    expect(isOn(pushToggle('moderationPushEnabled'))).toBe(true);
  });

  it('TC-SET-017 REQ-SET-008 조회 중에는 settings.push-loading이 보이고 스위치 3개가 모두 비활성이다', async () => {
    const gate = deferred<Response>();
    await openPush({ get: [() => gate.promise] });
    expect(await screen.findByTestId('settings.push-loading')).toBeInTheDocument();
    for (const key of KEYS) expect(isDisabled(pushToggle(key))).toBe(true);
    gate.resolve(resp('settings/notification-settings__get-all-true.json'));
    await waitFor(() => expect(isDisabled(pushToggle('topicPushEnabled'))).toBe(false));
    expect(screen.queryByTestId('settings.push-loading')).not.toBeInTheDocument();
  });

  it('TC-SET-039 OS 알림 권한 행은 없고 서버 스위치 3개만 있다. 브라우저 알림 권한 API도 건드리지 않는다', async () => {
    const requestPermission = vi.fn();
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission });
    try {
      const { h } = await openReady();
      expect(screen.queryByText(/시스템|OS|기기|브라우저/)).not.toBeInTheDocument();
      expect(screen.getAllByRole('switch')).toHaveLength(3);
      fireEvent.click(pushToggle('topicPushEnabled'));
      await waitFor(() => expect(h.ff.callsTo(SETTINGS_PATCH)).toHaveLength(1));
      expect(requestPermission).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('TC-SET-040 REQ-SET-019 브라우저 알림이 차단(denied)돼 있어도 스위치를 켜면 시스템 설정 이동 없이 서버 PATCH만 보낸다', async () => {
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission: vi.fn() });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    try {
      const { h, router } = await openReady({ get: [fx('settings/notification-settings__get-ai-off.json')] });
      fireEvent.click(pushToggle('aiReviewPushEnabled'));
      await waitFor(() => expect(patchBodies(h.ff)).toEqual([{ aiReviewPushEnabled: true }]));
      expect(isOn(pushToggle('aiReviewPushEnabled'))).toBe(true);
      expect(open).not.toHaveBeenCalled();
      expect(router.state.location.pathname).toBe('/settings');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('푸시 설정 조회 실패 (TC-SET-016)', () => {
  it('"알림 설정을 불러오지 못했어요. 다시 시도해 주세요."와 재시도 버튼이 보이고 스위치는 모두 비활성이며 값을 지어내 켜 두지 않는다', async () => {
    const { h, toasts } = await openPush({ get: [fx('settings/notification-settings__get-internal-error.json')] });
    await settle(h);
    expect(await screen.findByTestId('settings.push-error')).toHaveTextContent('알림 설정을 불러오지 못했어요. 다시 시도해 주세요.');
    expect(screen.getByTestId('settings.push-retry-button')).toBeInTheDocument();
    for (const key of KEYS) {
      expect(isDisabled(pushToggle(key))).toBe(true);
      expect(isOn(pushToggle(key))).toBe(false);
    }
    expect(toasts.messages).toContain(t('settings.push.load-error'));
  });

  it('재시도를 누르면 다시 조회하고 성공하면 오류 표시가 사라지고 스위치가 활성이 된다', async () => {
    const err = fx('settings/notification-settings__get-internal-error.json');
    const { h } = await openPush({ get: [err, err, err, fx('settings/notification-settings__get-topic-off.json')] });
    await settle(h);
    fireEvent.click(await screen.findByTestId('settings.push-retry-button'));
    await waitFor(() => expect(isDisabled(pushToggle('topicPushEnabled'))).toBe(false));
    expect(screen.queryByTestId('settings.push-error')).not.toBeInTheDocument();
    expect(isOn(pushToggle('topicPushEnabled'))).toBe(false);
    expect(h.ff.callsTo(SETTINGS_GET)).toHaveLength(4);
  });

  it('TC-SET-015 필수 필드가 빠진 응답도 잘못된 응답이라 같은 오류 상태이다', async () => {
    const { h } = await openPush({ get: [fx('settings/notification-settings__get-field-missing.json')] });
    await settle(h);
    expect(await screen.findByTestId('settings.push-error')).toBeInTheDocument();
    for (const key of KEYS) expect(isDisabled(pushToggle(key))).toBe(true);
  });

  it('TC-SET-033 재조회가 실패한 상태에서는 스위치를 눌러도 PATCH가 나가지 않는다', async () => {
    const { h } = await openPush({ get: [fx('settings/notification-settings__get-field-missing.json')] });
    await settle(h);
    await screen.findByTestId('settings.push-error');
    fireEvent.click(pushToggle('moderationPushEnabled'));
    await settle(h);
    expect(h.ff.callsTo(SETTINGS_PATCH)).toHaveLength(0);
  });
});

describe('푸시 스위치 저장', () => {
  it('TC-SET-023 REQ-SET-011 누르는 즉시(응답 전) 새 상태로 보이고, 저장이 끝나도 서버 값으로 다시 덮어쓰지 않는다', async () => {
    const gate = deferred<Response>();
    const { h } = await openReady({ patch: [() => gate.promise] });
    fireEvent.click(pushToggle('topicPushEnabled'));
    expect(isOn(pushToggle('topicPushEnabled'))).toBe(false);
    expect(isOn(pushToggle('moderationPushEnabled'))).toBe(true);
    gate.resolve(resp('settings/notification-settings__patch-no-content.json'));
    await waitFor(() => expect(h.ff.callsTo(SETTINGS_PATCH)).toHaveLength(1));
    await settle(h);
    expect(isOn(pushToggle('topicPushEnabled'))).toBe(false);
    expect(h.ff.callsTo(SETTINGS_GET)).toHaveLength(1);
  });

  it.each<[string, PushSettingKey]>([
    ['TC-SET-019', 'topicPushEnabled'],
    ['TC-SET-020', 'moderationPushEnabled'],
    ['TC-SET-021', 'aiReviewPushEnabled'],
  ])('%s %s 스위치를 끄면 바뀐 항목 하나만 PATCH하고, 다시 켜면 true 하나만 보낸다', async (_tc, key) => {
    const { h } = await openReady();
    fireEvent.click(pushToggle(key));
    await waitFor(() => expect(patchBodies(h.ff)).toEqual([{ [key]: false }]));
    await waitFor(() => expect(isDisabled(pushToggle(key))).toBe(false));
    fireEvent.click(pushToggle(key));
    await waitFor(() => expect(patchBodies(h.ff)).toEqual([{ [key]: false }, { [key]: true }]));
  });

  it('REQ-SET-011 키보드(Space)로도 스위치를 바꿀 수 있다', async () => {
    const { h } = await openReady();
    const user = userEvent.setup();
    pushToggle('moderationPushEnabled').focus();
    await user.keyboard(' ');
    await waitFor(() => expect(patchBodies(h.ff)).toEqual([{ moderationPushEnabled: false }]));
    expect(isOn(pushToggle('moderationPushEnabled'))).toBe(false);
  });

  it('TC-SET-024 저장이 실패하면(재시도 소진) 그 스위치만 이전 값으로 돌아오고 토스트 "알림 설정을 저장하지 못했어요. 다시 시도해 주세요."가 뜬다', async () => {
    const { h, toasts } = await openReady({ patch: [fx('settings/notification-settings__patch-internal-error.json')] });
    fireEvent.click(pushToggle('aiReviewPushEnabled'));
    expect(isOn(pushToggle('aiReviewPushEnabled'))).toBe(false);
    await settle(h);
    expect(isOn(pushToggle('aiReviewPushEnabled'))).toBe(true);
    expect(isOn(pushToggle('topicPushEnabled'))).toBe(true);
    expect(toasts.messages).toEqual(['알림 설정을 저장하지 못했어요. 다시 시도해 주세요.']);
    expect(h.ff.callsTo(SETTINGS_PATCH)).toHaveLength(3); // D-21: 멱등 PATCH는 최대 2회 재시도
  });

  it('TC-SET-025 TC-SET-026 한 항목의 저장 실패가 이미 성공한 다른 항목을 되돌리지 않는다', async () => {
    const { h } = await openReady({ patch: [fx('settings/notification-settings__patch-no-content.json'), fx('settings/notification-settings__patch-internal-error.json')] });
    fireEvent.click(pushToggle('moderationPushEnabled'));
    await waitFor(() => expect(h.ff.callsTo(SETTINGS_PATCH)).toHaveLength(1));
    fireEvent.click(pushToggle('topicPushEnabled'));
    await settle(h);
    expect(isOn(pushToggle('moderationPushEnabled'))).toBe(false);
    expect(isOn(pushToggle('topicPushEnabled'))).toBe(true);
  });

  it('TC-SET-028 REQ-SET-014 같은 스위치를 저장 중에 연타하면 PATCH는 한 번이다', async () => {
    const gate = deferred<Response>();
    const { h } = await openReady({ patch: [() => gate.promise] });
    const toggle = pushToggle('topicPushEnabled');
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    gate.resolve(resp('settings/notification-settings__patch-no-content.json'));
    await settle(h);
    expect(patchBodies(h.ff)).toEqual([{ topicPushEnabled: false }]);
    expect(isOn(toggle)).toBe(false);
  });

  it('TC-SET-029 주제 저장 중에도 다른 스위치는 비활성이 아니고 독립적으로 별도 PATCH가 나간다', async () => {
    const gate = deferred<Response>();
    const { h } = await openReady({ patch: [() => gate.promise] });
    fireEvent.click(pushToggle('topicPushEnabled'));
    expect(isDisabled(pushToggle('moderationPushEnabled'))).toBe(false);
    expect(isDisabled(pushToggle('aiReviewPushEnabled'))).toBe(false);
    fireEvent.click(pushToggle('moderationPushEnabled'));
    fireEvent.click(pushToggle('aiReviewPushEnabled'));
    await waitFor(() => expect(patchBodies(h.ff)).toHaveLength(3));
    expect(patchBodies(h.ff)).toEqual([{ topicPushEnabled: false }, { moderationPushEnabled: false }, { aiReviewPushEnabled: false }]);
    gate.resolve(resp('settings/notification-settings__patch-no-content.json'));
  });

  it('TC-SET-030 저장 중에 설정 탭을 떠나면 오류 토스트 없이 끝난다(저장은 취소되고 돌아오면 서버 값을 다시 조회한다)', async () => {
    const { h, toasts } = await openReady({ patch: [() => new Promise<Response>(() => {})] });
    fireEvent.click(pushToggle('topicPushEnabled'));
    await waitFor(() => expect(h.ff.callsTo(SETTINGS_PATCH)).toHaveLength(1));
    fireEvent.click(screen.getByTestId('bottom-bar.tab-display'));
    await screen.findByTestId('display.root');
    await settle(h);
    expect(h.ff.callsTo(SETTINGS_PATCH)[0]!.signal?.aborted).toBe(true);
    expect(toasts.messages).toEqual([]);
    expect(h.container.notificationSettings.state.saving.topicPushEnabled).toBe(false);
  });

  it('TC-SET-034 PATCH가 401 REAUTHENTICATION_REQUIRED면 토스트 없이 로그인 화면으로 이동한다', async () => {
    const { h, toasts, router } = await openReady({ patch: [fx('settings/notification-settings__patch-unauthorized.json')] });
    h.ff.route('POST /auth/refresh', fx('auth/refresh__reauthentication-required.json'));
    fireEvent.click(pushToggle('topicPushEnabled'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(toasts.messages).toEqual([]);
  });

  it('REQ-SET-021 정지 회원도 조회·수정할 수 있다(별도 정지 안내가 없다)', async () => {
    const { h, toasts } = await openReady();
    fireEvent.click(pushToggle('topicPushEnabled'));
    await waitFor(() => expect(patchBodies(h.ff)).toEqual([{ topicPushEnabled: false }]));
    expect(toasts.messages).toEqual([]);
  });
});

describe('푸시 설정 가시성·재조회 (R2, R3)', () => {
  const setVisibility = (state: 'hidden' | 'visible') => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  afterEach(() => {
    Reflect.deleteProperty(document, 'visibilityState');
  });

  it('R2 문서가 가려져도 진행 중인 저장은 취소·복원되지 않는다', async () => {
    const gate = deferred<Response>();
    const { h } = await openReady({ patch: [() => gate.promise] });
    fireEvent.click(pushToggle('topicPushEnabled'));
    await waitFor(() => expect(h.ff.callsTo(SETTINGS_PATCH)).toHaveLength(1));
    act(() => setVisibility('hidden'));
    expect(h.ff.callsTo(SETTINGS_PATCH)[0]!.signal?.aborted).toBe(false);
    expect(isOn(pushToggle('topicPushEnabled'))).toBe(false);
    gate.resolve(resp('settings/notification-settings__patch-no-content.json'));
    await settle(h);
    expect(isOn(pushToggle('topicPushEnabled'))).toBe(false);
  });

  it('R2 다시 보이면 서버 값을 다시 읽는다', async () => {
    const { h } = await openReady();
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    await waitFor(() => expect(h.ff.callsTo(SETTINGS_GET)).toHaveLength(2));
  });

  it('R3 다시 읽는 동안에는 이전 값을 그대로 보이고 비활성만 한다', async () => {
    const gate = deferred<Response>();
    const { h } = await openReady({ get: [fx('settings/notification-settings__get-ai-off.json'), () => gate.promise] });
    expect(isOn(pushToggle('aiReviewPushEnabled'))).toBe(false);
    expect(isOn(pushToggle('topicPushEnabled'))).toBe(true);
    act(() => setVisibility('visible'));
    await waitFor(() => expect(h.ff.callsTo(SETTINGS_GET)).toHaveLength(2));
    expect(isDisabled(pushToggle('topicPushEnabled'))).toBe(true);
    expect(isOn(pushToggle('topicPushEnabled'))).toBe(true);
    gate.resolve(resp('settings/notification-settings__get-all-true.json'));
    await waitFor(() => expect(isDisabled(pushToggle('topicPushEnabled'))).toBe(false));
  });
});
