import { deferred, networkFailure } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { t } from '../../shared/copy';
import {
  createSettingsHarness,
  GET_PUSH,
  PATCH_PUSH,
  type SettingsHarness,
} from './__testing__/createSettingsHarness';

const flush = async () => {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
};

const OK = 'settings/notification-settings__patch-no-content';
const FAIL = 'settings/notification-settings__patch-internal-error';

async function shown(options: Parameters<typeof createSettingsHarness>[0] = {}) {
  const h = await createSettingsHarness(options);
  await h.viewModel.onShown();
  return h;
}

const values = (h: SettingsHarness) => h.viewModel.getSnapshot().push.values;
const saving = (h: SettingsHarness) => h.viewModel.getSnapshot().push.saving;

/** 열 때까지 PATCH 응답을 미루는 라우트. */
function holdPatch(h: SettingsHarness, fixture = OK) {
  const gate = deferred<void>();
  h.router.set(PATCH_PUSH, async () => {
    await gate.promise;
    return fixtureResponse(fixture);
  });
  return { release: () => gate.resolve() };
}

/** PATCH 바디에 들어 있는 키에 따라 결과를 나눈다. */
function patchByKey(h: SettingsHarness, failingField: string) {
  h.router.set(PATCH_PUSH, (request) =>
    String(request.body).includes(failingField) ? fixtureResponse(FAIL) : fixtureResponse(OK),
  );
}

describe('SettingsViewModel 푸시 토글 저장', () => {
  it.each([
    { tc: 'TC-SET-019', key: 'topic', body: { topicPushEnabled: false } },
    { tc: 'TC-SET-020', key: 'moderation', body: { moderationPushEnabled: false } },
    { tc: 'TC-SET-021', key: 'aiReview', body: { aiReviewPushEnabled: false } },
  ] as const)('$tc $key 토글은 바뀐 항목 하나만 PATCH한다', async ({ key, body }) => {
    const h = await shown();
    await h.viewModel.onPushToggle(key);
    expect(h.patchBodies()).toEqual([body]);
  });

  it('TC-SET-023 REQ-SET-011 탭하면 응답 전에 즉시 새 값으로 보이고 그 항목만 saving이다', async () => {
    const h = await shown();
    const patch = holdPatch(h);
    const toggling = h.viewModel.onPushToggle('topic');
    await flush();
    expect(values(h)).toEqual({ topic: false, moderation: true, aiReview: true });
    expect(saving(h)).toEqual({ topic: true, moderation: false, aiReview: false });
    patch.release();
    await toggling;
    expect(values(h)?.topic).toBe(false);
    expect(saving(h).topic).toBe(false);
  });

  it('REQ-SET-012 성공(204) 뒤에는 서버 값을 다시 불러와 덮어쓰지 않는다', async () => {
    const h = await shown();
    await h.viewModel.onPushToggle('topic');
    expect(h.callsOf(GET_PUSH)).toBe(1);
    expect(values(h)?.topic).toBe(false);
  });

  it('REQ-SET-012 다시 눌러 켜는 값도 해당 항목만 true로 보낸다', async () => {
    const h = await shown();
    await h.viewModel.onPushToggle('topic');
    await h.viewModel.onPushToggle('topic');
    expect(h.patchBodies()).toEqual([{ topicPushEnabled: false }, { topicPushEnabled: true }]);
  });

  it.each([
    ['500', FAIL],
    ['네트워크 오류', networkFailure()],
  ])(
    'TC-SET-024 저장이 실패(%s)하면 해당 토글만 이전 값으로 돌아오고 토스트 settings.push.save-error다',
    async (_n, failure) => {
      const h = await shown();
      h.router.set(PATCH_PUSH, failure);
      await h.viewModel.onPushToggle('moderation');
      expect(values(h)).toEqual({ topic: true, moderation: true, aiReview: true });
      expect(saving(h).moderation).toBe(false);
      expect(h.toast.messages).toEqual([t('settings.push.save-error')]);
    },
  );

  it('TC-SET-025 주제 저장이 실패해도 이미 성공한 승인·반려 변경은 유지된다', async () => {
    const h = await shown();
    patchByKey(h, 'topicPushEnabled');
    await h.viewModel.onPushToggle('moderation');
    await h.viewModel.onPushToggle('topic');
    expect(values(h)).toEqual({ topic: true, moderation: false, aiReview: true });
  });

  it('TC-SET-026 승인·반려 저장이 실패해도 이미 성공한 다른 변경은 유지된다', async () => {
    const h = await shown();
    patchByKey(h, 'moderationPushEnabled');
    await h.viewModel.onPushToggle('aiReview');
    await h.viewModel.onPushToggle('moderation');
    expect(values(h)).toEqual({ topic: true, moderation: true, aiReview: false });
  });

  it('TC-SET-027 AI 저장이 실패해도 성공한 다른 설정은 유지되고 실패 항목의 중복 저장은 막힌다', async () => {
    const h = await shown();
    const gate = deferred<void>();
    h.router.set(PATCH_PUSH, async (request) => {
      if (String(request.body).includes('aiReviewPushEnabled')) {
        await gate.promise;
        return fixtureResponse(FAIL);
      }
      return fixtureResponse(OK);
    });
    const failing = h.viewModel.onPushToggle('aiReview');
    void h.viewModel.onPushToggle('aiReview');
    await h.viewModel.onPushToggle('topic');
    gate.resolve();
    await failing;
    await flush();
    expect(values(h)).toEqual({ topic: false, moderation: true, aiReview: true });
    // 실패한 항목의 요청은 첫 시도 + 자동 재시도 2회뿐이다(두 번째 탭은 새 요청을 만들지 않았다).
    expect(h.patchBodies().filter((b) => 'aiReviewPushEnabled' in b)).toHaveLength(3);
  });

  it('TC-SET-028 REQ-SET-014 같은 항목 저장 중 같은 토글을 다시 탭하면 요청은 한 번이고 두 번째 입력은 무시된다', async () => {
    const h = await shown();
    const patch = holdPatch(h);
    const first = h.viewModel.onPushToggle('topic');
    void h.viewModel.onPushToggle('topic');
    void h.viewModel.onPushToggle('topic');
    await flush();
    patch.release();
    await first;
    await flush();
    expect(h.router.calls(PATCH_PUSH)).toHaveLength(1);
    expect(values(h)?.topic).toBe(false);
  });

  it('TC-SET-029 주제 저장 중에도 승인·반려, AI 토글은 막히지 않고 독립적으로 별도 PATCH가 나간다', async () => {
    const h = await shown();
    const gate = deferred<void>();
    h.router.set(PATCH_PUSH, async (request) => {
      if (String(request.body).includes('topicPushEnabled')) await gate.promise;
      return fixtureResponse(OK);
    });
    const topic = h.viewModel.onPushToggle('topic');
    await h.viewModel.onPushToggle('moderation');
    await h.viewModel.onPushToggle('aiReview');
    expect(saving(h)).toEqual({ topic: true, moderation: false, aiReview: false });
    expect(h.router.calls(PATCH_PUSH)).toHaveLength(3);
    gate.resolve();
    await topic;
    expect(values(h)).toEqual({ topic: false, moderation: false, aiReview: false });
  });

  it('TC-SET-030 저장 중 화면을 떠나면(onHidden) 토글이 이전 값으로 복구되고 오류 토스트는 뜨지 않는다', async () => {
    const h = await shown();
    const patch = holdPatch(h);
    const toggling = h.viewModel.onPushToggle('topic');
    await flush();
    h.viewModel.onHidden();
    patch.release();
    await toggling;
    await flush();
    expect(values(h)?.topic).toBe(true);
    expect(saving(h).topic).toBe(false);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-SET-031 저장 도중 계정이 바뀌면(clearAll) 이전 계정의 저장 응답을 적용하지 않고 토스트도 없다', async () => {
    const h = await shown();
    const patch = holdPatch(h, FAIL);
    const toggling = h.viewModel.onPushToggle('topic');
    await flush();
    await h.viewModel.clearAll();
    patch.release();
    await toggling;
    await flush();
    expect(h.viewModel.getSnapshot().push).toMatchObject({ status: 'loading', values: null });
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-SET-033 재조회가 실패한 뒤에는 오래된 서버 값을 기준으로 변경하지 않는다', async () => {
    const h = await shown();
    h.viewModel.onHidden();
    h.router.set(GET_PUSH, 'settings/notification-settings__get-internal-error');
    await h.viewModel.onShown();
    await h.viewModel.onPushToggle('topic');
    expect(h.router.calls(PATCH_PUSH)).toHaveLength(0);
    expect(h.viewModel.getSnapshot().push.status).toBe('error');
  });

  it('TC-SET-035 PATCH가 500이면 0.5초, 1초 백오프로 2회 재시도하고 소진 뒤 롤백 + 토스트 1건이다', async () => {
    const h = await shown();
    h.router.set(PATCH_PUSH, FAIL);
    await h.viewModel.onPushToggle('topic');
    expect(h.router.calls(PATCH_PUSH)).toHaveLength(3);
    expect(h.sleeper.calls).toEqual([500, 1000]);
    expect(values(h)?.topic).toBe(true);
    expect(h.toast.messages).toEqual([t('settings.push.save-error')]);
  });

  it('TC-SET-036 로딩 중·오류 상태에서는 토글을 눌러도 빈 PATCH를 포함해 어떤 요청도 보내지 않는다', async () => {
    const h = await createSettingsHarness();
    await h.viewModel.onPushToggle('topic');
    expect(h.router.calls(PATCH_PUSH)).toHaveLength(0);
    h.router.set(GET_PUSH, 'settings/notification-settings__get-internal-error');
    await h.viewModel.onShown();
    await h.viewModel.onPushToggle('aiReview');
    expect(h.router.calls(PATCH_PUSH)).toHaveLength(0);
  });

  it('TC-SET-036 서버가 400 BUSINESS_ERROR를 돌려주면 복원하고 settings.push.save-error를 보인다', async () => {
    const h = await shown();
    h.router.set(PATCH_PUSH, 'settings/notification-settings__patch-bad-request-empty');
    await h.viewModel.onPushToggle('topic');
    expect(values(h)?.topic).toBe(true);
    expect(h.toast.messages).toEqual([t('settings.push.save-error')]);
  });
});

describe('SettingsViewModel 푸시 설정 401', () => {
  it('TC-SET-034 PATCH 401 뒤 refresh가 성공하면 재전송해 성공으로 끝난다', async () => {
    const h = await shown();
    h.router.set('POST /auth/refresh', 'auth/refresh__success');
    h.router.set(PATCH_PUSH, (request) =>
      request.headers.Authorization === 'Bearer access-1'
        ? fixtureResponse('settings/notification-settings__patch-unauthorized')
        : fixtureResponse(OK),
    );
    await h.viewModel.onPushToggle('topic');
    expect(values(h)?.topic).toBe(false);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-SET-034 REAUTHENTICATION_REQUIRED면 값을 복원하되 토스트도 화면 이동도 직접 하지 않는다', async () => {
    const h = await shown();
    h.router.set(PATCH_PUSH, 'settings/notification-settings__patch-unauthorized');
    h.router.set('POST /auth/refresh', 'auth/refresh__reauthentication-required');
    await h.viewModel.onPushToggle('topic');
    expect(values(h)?.topic).toBe(true);
    expect(h.toast.messages).toEqual([]);
    expect(h.authFlow.calls).toEqual([]);
    expect(h.emitted.map((e) => e.type)).toContain('session-expired');
  });

  it('TC-SET-034 갱신 뒤에도 남은 401이면 로그인 화면으로 보내고 토스트는 없다', async () => {
    const h = await shown();
    h.router.set(PATCH_PUSH, 'settings/notification-settings__patch-unauthorized');
    h.router.set('POST /auth/refresh', 'auth/refresh__success');
    await h.viewModel.onPushToggle('topic');
    expect(values(h)?.topic).toBe(true);
    expect(h.authFlow.calls).toEqual(['login']);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-SET-034 GET 401 REAUTHENTICATION_REQUIRED면 오류 토스트 없이 끝난다', async () => {
    const h = await createSettingsHarness();
    h.router.set(GET_PUSH, 'settings/notification-settings__get-unauthorized');
    h.router.set('POST /auth/refresh', 'auth/refresh__reauthentication-required');
    await h.viewModel.onShown();
    expect(h.toast.messages).toEqual([]);
    expect(h.authFlow.calls).toEqual([]);
    expect(h.viewModel.getSnapshot().push.status).toBe('error');
  });
});

describe('SettingsViewModel 기기 알림 권한', () => {
  it('TC-SET-038 REQ-SET-015 OS 권한이 꺼져 있을 때 스위치를 켜면 시스템 알림 설정을 1회 열고 값도 서버도 바꾸지 않는다', async () => {
    const h = await shown({
      permission: 'denied',
      routes: { [GET_PUSH]: 'settings/notification-settings__get-ai-off' },
    });
    await h.viewModel.onPushToggle('aiReview');
    expect(h.permission.settingsOpened).toBe(1);
    expect(h.router.calls(PATCH_PUSH)).toHaveLength(0);
    expect(values(h)?.aiReview).toBe(false);
    expect(saving(h).aiReview).toBe(false);
  });

  it('TC-SET-038 OS 권한이 허용이면 시스템 설정을 열지 않고 정상 저장한다', async () => {
    const h = await shown({
      permission: 'granted',
      routes: { [GET_PUSH]: 'settings/notification-settings__get-ai-off' },
    });
    await h.viewModel.onPushToggle('aiReview');
    expect(h.permission.settingsOpened).toBe(0);
    expect(h.patchBodies()).toEqual([{ aiReviewPushEnabled: true }]);
  });

  it('TC-SET-038 권한 확인은 토글 시점의 최신 상태를 쓴다(앞서 확인한 값에 의존하지 않는다)', async () => {
    const h = await shown({
      permission: 'granted',
      routes: { [GET_PUSH]: 'settings/notification-settings__get-ai-off' },
    });
    h.permission.status = 'denied';
    await h.viewModel.onPushToggle('aiReview');
    expect(h.permission.settingsOpened).toBe(1);
    expect(h.router.calls(PATCH_PUSH)).toHaveLength(0);
  });

  it('REQ-SET-016 OS 권한이 꺼져 있어도 스위치를 끄는 것은 정상 저장 흐름이다', async () => {
    const h = await shown({ permission: 'denied' });
    await h.viewModel.onPushToggle('topic');
    expect(h.permission.settingsOpened).toBe(0);
    expect(h.patchBodies()).toEqual([{ topicPushEnabled: false }]);
    expect(values(h)?.topic).toBe(false);
  });

  it('REQ-SET-018 권한 미결정이면 시스템 권한 요청을 띄우고 허용되면 켜는 저장을 진행한다', async () => {
    const h = await shown({
      permission: 'undetermined',
      routes: { [GET_PUSH]: 'settings/notification-settings__get-ai-off' },
    });
    h.permission.requestResult = 'granted';
    await h.viewModel.onPushToggle('aiReview');
    expect(h.permission.requests).toBe(1);
    expect(h.patchBodies()).toEqual([{ aiReviewPushEnabled: true }]);
    expect(values(h)?.aiReview).toBe(true);
  });

  it('REQ-SET-018 권한 요청이 거부되면 스위치를 켜지 않고 PATCH도 보내지 않는다', async () => {
    const h = await shown({
      permission: 'undetermined',
      routes: { [GET_PUSH]: 'settings/notification-settings__get-ai-off' },
    });
    h.permission.requestResult = 'denied';
    await h.viewModel.onPushToggle('aiReview');
    expect(h.permission.requests).toBe(1);
    expect(h.router.calls(PATCH_PUSH)).toHaveLength(0);
    expect(values(h)?.aiReview).toBe(false);
    expect(saving(h).aiReview).toBe(false);
  });

  it('REQ-SET-017 포그라운드로 돌아오면 권한 상태를 다시 확인하되 스위치 값은 서버 값 그대로다', async () => {
    const h = await shown({ permission: 'denied' });
    const before = h.permission.statusChecks;
    h.permission.status = 'granted';
    h.visibility.emit('foreground');
    await flush();
    expect(h.permission.statusChecks).toBeGreaterThan(before);
    expect(h.viewModel.getSnapshot().devicePermission).toBe('granted');
    expect(values(h)).toEqual({ topic: true, moderation: true, aiReview: true });
    expect(h.router.calls(PATCH_PUSH)).toHaveLength(0);
  });

  it('REQ-SET-017 백그라운드 전환에서는 확인하지 않고, 화면을 떠나면(onHidden) 구독을 해제한다', async () => {
    const h = await shown();
    const before = h.permission.statusChecks;
    h.visibility.emit('background');
    await flush();
    expect(h.permission.statusChecks).toBe(before);
    h.viewModel.onHidden();
    expect(h.visibility.listenerCount).toBe(0);
  });
});
