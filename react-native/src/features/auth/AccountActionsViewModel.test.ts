import { FakeToastPresenter } from '../../core/toast/__testing__/FakeToastPresenter';
import { deferred, networkFailure } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { createAuthHarness } from '../../data/auth/__testing__/createAuthHarness';
import { t } from '../../shared/copy';
import { AccountActionsViewModel } from './AccountActionsViewModel';
import { FakeAuthFlowNavigator } from './__testing__/FakeAuthFlowNavigator';

const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

function setup() {
  const h = createAuthHarness();
  const navigator = new FakeAuthFlowNavigator();
  const toast = new FakeToastPresenter();
  const viewModel = new AccountActionsViewModel({
    authRepository: h.repository,
    navigator,
    toast,
  });
  return { ...h, navigator, toast, viewModel };
}

describe('AccountActionsViewModel 로그아웃', () => {
  it('TC-AUTH-035 TC-AUTH-036 로그아웃 요청이 실패해도 로그인 화면으로 가고 토스트는 없다', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse('auth/logout__internal-error'));

    await h.viewModel.confirmLogout();

    expect(h.navigator.calls).toEqual(['login']);
    expect(h.toast.messages).toEqual([]);
    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
    expect(h.viewModel.getSnapshot().pending).toBe('none');
  });

  it('TC-AUTH-040 확정 버튼을 연타해도 로그아웃 요청 1회, 로컬 정리 1회이며 진행 중 pending이다', async () => {
    const h = setup();
    await h.signIn();
    const gate = deferred<void>();
    h.transport.respond(async () => {
      await gate.promise;
      return fixtureResponse('auth/logout__no-content');
    });

    const first = h.viewModel.confirmLogout();
    void h.viewModel.confirmLogout();
    void h.viewModel.confirmLogout();
    await flush();
    expect(h.viewModel.getSnapshot().pending).toBe('logout');

    gate.resolve();
    await first;
    await flush();

    expect(h.transport.requestsTo('POST', '/auth/logout')).toHaveLength(1);
    expect(h.cache.clearCalls).toBe(1);
    expect(h.navigator.calls).toEqual(['login']);
  });
});

describe('AccountActionsViewModel 탈퇴', () => {
  it('TC-AUTH-043 204면 세션을 정리하고 로그인 화면으로 간다', async () => {
    const h = setup();
    await h.signIn();
    h.routes({ 'DELETE /users/me': 'auth/users-me__delete-no-content' });

    await h.viewModel.confirmWithdraw();

    expect(h.navigator.calls).toEqual(['login']);
    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
    expect(h.toast.messages).toEqual([]);
  });

  it.each([
    ['500', () => fixtureResponse('auth/users-me__delete-internal-error')],
    ['네트워크 오류', () => networkFailure()],
  ])(
    'TC-AUTH-044 %s면 세션·화면을 유지하고 토스트 auth.withdraw.error를 보인다',
    async (_name, failure) => {
      const h = setup();
      const credentials = await h.signIn();
      h.transport.script(failure());

      await h.viewModel.confirmWithdraw();

      expect(h.navigator.calls).toEqual([]);
      expect(h.toast.messages).toEqual([t('auth.withdraw.error')]);
      expect(await h.sessionStore.load()).toEqual({ kind: 'authenticated', credentials });
      expect(h.viewModel.getSnapshot().pending).toBe('none');
    },
  );

  it('TC-AUTH-048 탈퇴 확정을 연타해도 DELETE는 1회다', async () => {
    const h = setup();
    await h.signIn();
    const gate = deferred<void>();
    h.transport.respond(async () => {
      await gate.promise;
      return fixtureResponse('auth/users-me__delete-no-content');
    });

    const first = h.viewModel.confirmWithdraw();
    void h.viewModel.confirmWithdraw();
    await flush();
    expect(h.viewModel.getSnapshot().pending).toBe('withdraw');
    gate.resolve();
    await first;
    await flush();

    expect(h.transport.requestsTo('DELETE', '/users/me')).toHaveLength(1);
  });

  it('TC-AUTH-049 요청 중 화면이 사라져도 204가 오면 로컬 세션은 정리되고 취소 오류 토스트는 없다', async () => {
    const h = setup();
    await h.signIn();
    const gate = deferred<void>();
    h.transport.respond(async () => {
      await gate.promise;
      return fixtureResponse('auth/users-me__delete-no-content');
    });

    const withdraw = h.viewModel.confirmWithdraw();
    await flush();
    h.viewModel.dispose();
    gate.resolve();
    await withdraw;

    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-AUTH-049 화면이 사라진 뒤 실패하면 토스트를 띄우지 않는다', async () => {
    const h = setup();
    await h.signIn();
    const gate = deferred<void>();
    h.transport.respond(async () => {
      await gate.promise;
      return fixtureResponse('auth/users-me__delete-internal-error');
    });

    const withdraw = h.viewModel.confirmWithdraw();
    await flush();
    h.viewModel.dispose();
    gate.resolve();
    await withdraw;

    expect(h.toast.messages).toEqual([]);
  });
});

describe('AccountActionsViewModel 게스트', () => {
  it('TC-AUTH-033 게스트 "로그인" 버튼은 게스트 플래그를 지우고 로그인 화면으로 간다', async () => {
    const h = setup();
    await h.sessionStore.enterGuest();
    await h.viewModel.loginFromGuest();
    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
    expect(h.navigator.calls).toEqual(['login']);
    expect(h.transport.requests).toHaveLength(0);
  });
});
