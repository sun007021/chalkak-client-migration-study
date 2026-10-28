import { deferred, networkFailure } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { t } from '../../shared/copy';
import { createSettingsHarness, GET_PUSH, PATCH_PUSH } from './__testing__/createSettingsHarness';

const flush = async () => {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
};

const DELETE_ME = 'DELETE /users/me';
const LOGOUT = 'POST /auth/logout';

async function shown() {
  const h = await createSettingsHarness();
  await h.viewModel.onShown();
  return h;
}

describe('SettingsViewModel 로그아웃', () => {
  it('TC-SET-041 로그아웃 행을 누르면 확인 대화상자(logout)가 열린다', async () => {
    const h = await shown();
    h.viewModel.onLogoutPress();
    expect(h.viewModel.getSnapshot().dialog).toBe('logout');
  });

  it('TC-SET-042 REQ-AUTH-032 취소하면 API 호출 0건이고 설정 화면이 유지된다', async () => {
    const h = await shown();
    const before = h.transport.requests.length;
    h.viewModel.onLogoutPress();
    h.viewModel.onDialogCancel();
    expect(h.viewModel.getSnapshot().dialog).toBe('none');
    expect(h.transport.requests).toHaveLength(before);
    expect(h.authFlow.calls).toEqual([]);
    expect(await h.sessionStore.load()).toMatchObject({ kind: 'authenticated' });
  });

  it('TC-SET-043 확인하면 로컬 정리 뒤 로그인 화면으로 가고 서버 폐기는 refreshToken으로 보낸다', async () => {
    const h = await shown();
    h.viewModel.onLogoutPress();
    await h.viewModel.onDialogConfirm();
    await flush();
    expect(h.authFlow.calls).toEqual(['login']);
    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
    expect(h.viewModel.getSnapshot().dialog).toBe('none');
    const revoke = h.router.calls(LOGOUT);
    expect(revoke).toHaveLength(1);
    expect(JSON.parse(String(revoke[0].body))).toEqual({ refreshToken: 'refresh-1' });
  });

  it('TC-SET-043 로컬 정리(clearAll)가 설정 ViewModel과 사인 카드를 비운다(이전 계정 값이 남지 않음)', async () => {
    const h = await shown();
    h.viewModel.onLogoutPress();
    await h.viewModel.onDialogConfirm();
    expect(h.viewModel.getSnapshot().push).toMatchObject({ status: 'loading', values: null });
    expect(h.signatureCard.getSnapshot().imageUrl).toBeNull();
  });

  it('TC-SET-031 로그아웃 시점에 진행 중이던 푸시 저장의 늦은 응답은 적용되지 않고 토스트도 없다', async () => {
    const h = await shown();
    const gate = deferred<void>();
    h.router.set(PATCH_PUSH, async () => {
      await gate.promise;
      return fixtureResponse('settings/notification-settings__patch-internal-error');
    });
    const toggling = h.viewModel.onPushToggle('topic');
    await flush();
    h.viewModel.onLogoutPress();
    await h.viewModel.onDialogConfirm();
    gate.resolve();
    await toggling;
    await flush();
    expect(h.toast.messages).toEqual([]);
    expect(h.viewModel.getSnapshot().push.values).toBeNull();
  });

  it('TC-SET-037 로그아웃 뒤 다시 로그인해 설정을 열면 이전 계정 값이 아니라 새로 조회한 값이다', async () => {
    const h = await shown();
    h.viewModel.onLogoutPress();
    await h.viewModel.onDialogConfirm();
    await h.signIn({ userId: 'user-b' });
    h.router.set(GET_PUSH, 'settings/notification-settings__get-topic-off');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().push.values).toEqual({
      topic: false,
      moderation: true,
      aiReview: true,
    });
  });

  it('TC-AUTH-040 확인 버튼 연타는 로그아웃 요청 1회뿐이다', async () => {
    const h = await shown();
    h.viewModel.onLogoutPress();
    const first = h.viewModel.onDialogConfirm();
    void h.viewModel.onDialogConfirm();
    void h.viewModel.onDialogConfirm();
    await first;
    await flush();
    expect(h.router.calls(LOGOUT)).toHaveLength(1);
    expect(h.authFlow.calls).toEqual(['login']);
  });

  it('TC-SET-043 서버 폐기가 실패해도 로그인 화면으로 가고 토스트는 없다', async () => {
    const h = await shown();
    h.router.set(LOGOUT, 'auth/logout__internal-error');
    h.viewModel.onLogoutPress();
    await h.viewModel.onDialogConfirm();
    await flush();
    expect(h.authFlow.calls).toEqual(['login']);
    expect(h.toast.messages).toEqual([]);
  });
});

describe('SettingsViewModel 회원탈퇴', () => {
  it('TC-SET-044 회원탈퇴 행을 누르면 확인 대화상자(withdraw)가 열린다', async () => {
    const h = await shown();
    h.viewModel.onWithdrawPress();
    expect(h.viewModel.getSnapshot().dialog).toBe('withdraw');
  });

  it('TC-SET-045 취소하면 DELETE 호출 0건이다', async () => {
    const h = await shown();
    h.viewModel.onWithdrawPress();
    h.viewModel.onDialogCancel();
    expect(h.viewModel.getSnapshot().dialog).toBe('none');
    expect(h.router.calls(DELETE_ME)).toHaveLength(0);
  });

  it('TC-SET-046 TC-AUTH-043 204면 세션·캐시를 정리하고 로그인 화면으로 간다', async () => {
    const h = await shown();
    h.viewModel.onWithdrawPress();
    await h.viewModel.onDialogConfirm();
    expect(h.router.calls(DELETE_ME)).toHaveLength(1);
    expect(h.authFlow.calls).toEqual(['login']);
    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
    expect(h.viewModel.getSnapshot().push.values).toBeNull();
    expect(h.toast.messages).toEqual([]);
  });

  it.each([
    ['500', 'auth/users-me__delete-internal-error'],
    ['네트워크 오류', networkFailure()],
  ])(
    'TC-SET-046 TC-AUTH-044 %s면 세션을 유지하고 설정 화면에 머물며 토스트 auth.withdraw.error다',
    async (_n, failure) => {
      const h = await shown();
      h.router.set(DELETE_ME, failure);
      h.viewModel.onWithdrawPress();
      await h.viewModel.onDialogConfirm();
      expect(h.toast.messages).toEqual([t('auth.withdraw.error')]);
      expect(h.authFlow.calls).toEqual([]);
      expect(await h.sessionStore.load()).toMatchObject({ kind: 'authenticated' });
      expect(h.viewModel.getSnapshot().dialog).toBe('none');
      expect(h.viewModel.getSnapshot().push.values).not.toBeNull();
    },
  );

  it('TC-AUTH-045 401이면 refresh 뒤 원 요청을 1회 재전송해 204로 처리한다', async () => {
    const h = await shown();
    h.router.set('POST /auth/refresh', 'auth/refresh__success');
    h.router.set(DELETE_ME, (request) =>
      request.headers.Authorization === 'Bearer access-1'
        ? fixtureResponse('auth/users-me__delete-unauthorized')
        : fixtureResponse('auth/users-me__delete-no-content'),
    );
    h.viewModel.onWithdrawPress();
    await h.viewModel.onDialogConfirm();
    expect(h.router.calls(DELETE_ME)).toHaveLength(2);
    expect(h.authFlow.calls).toEqual(['login']);
  });

  it('TC-AUTH-045 REAUTHENTICATION_REQUIRED면 탈퇴 실패 토스트 없이 끝난다(세션 만료 이벤트가 로그인으로 보낸다)', async () => {
    const h = await shown();
    h.router.set(DELETE_ME, 'auth/users-me__delete-unauthorized');
    h.router.set('POST /auth/refresh', 'auth/refresh__reauthentication-required');
    h.viewModel.onWithdrawPress();
    await h.viewModel.onDialogConfirm();
    expect(h.toast.messages).toEqual([]);
    expect(h.emitted.map((e) => e.type)).toContain('session-expired');
  });

  it('TC-AUTH-048 REQ-AUTH-040 처리 중에는 대화상자가 열린 채 pending이고 확인 연타는 DELETE 1회다', async () => {
    const h = await shown();
    const gate = deferred<void>();
    h.router.set(DELETE_ME, async () => {
      await gate.promise;
      return fixtureResponse('auth/users-me__delete-no-content');
    });
    h.viewModel.onWithdrawPress();
    const first = h.viewModel.onDialogConfirm();
    void h.viewModel.onDialogConfirm();
    await flush();
    expect(h.account.getSnapshot().pending).toBe('withdraw');
    expect(h.viewModel.getSnapshot().dialog).toBe('withdraw');
    gate.resolve();
    await first;
    expect(h.router.calls(DELETE_ME)).toHaveLength(1);
    expect(h.viewModel.getSnapshot().dialog).toBe('none');
  });

  it('TC-AUTH-049 요청 중 설정 화면이 사라진 뒤 204가 오면 로컬 세션은 정리되고 로그인으로 가며, 실패라면 토스트가 없다', async () => {
    const ok = await shown();
    const gate = deferred<void>();
    ok.router.set(DELETE_ME, async () => {
      await gate.promise;
      return fixtureResponse('auth/users-me__delete-no-content');
    });
    ok.viewModel.onWithdrawPress();
    const confirming = ok.viewModel.onDialogConfirm();
    await flush();
    ok.viewModel.dispose();
    gate.resolve();
    await confirming;
    expect(await ok.sessionStore.load()).toEqual({ kind: 'none' });
    expect(ok.authFlow.calls).toEqual(['login']);

    const failed = await shown();
    const gate2 = deferred<void>();
    failed.router.set(DELETE_ME, async () => {
      await gate2.promise;
      return fixtureResponse('auth/users-me__delete-internal-error');
    });
    failed.viewModel.onWithdrawPress();
    const pending = failed.viewModel.onDialogConfirm();
    await flush();
    failed.viewModel.dispose();
    gate2.resolve();
    await pending;
    expect(failed.toast.messages).toEqual([]);
  });
});
