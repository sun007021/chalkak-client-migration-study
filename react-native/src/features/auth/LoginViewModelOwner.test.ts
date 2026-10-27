import { deferred } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { createBootHarness } from '../boot/__testing__/createBootHarness';
import { createLoginHarness } from './__testing__/createLoginHarness';
import { LoginViewModelOwner } from './LoginViewModelOwner';

const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

function setup() {
  const boot = createBootHarness();
  const created: ReturnType<typeof createLoginHarness>[] = [];
  const owner = new LoginViewModelOwner(boot.viewModel, () => {
    const h = createLoginHarness();
    created.push(h);
    return h.viewModel;
  });
  return { boot, owner, created };
}

describe('LoginViewModelOwner', () => {
  it('phase가 login에 들어갈 때 ViewModel을 만들고 screen_view login을 정확히 1번 보낸다', async () => {
    const { boot, owner, created } = setup();
    expect(owner.getSnapshot().viewModel).toBeNull();
    await boot.viewModel.start();

    expect(owner.getSnapshot().viewModel).toBe(created[0].viewModel);
    expect(created).toHaveLength(1);
    expect(created[0].analytics.screenNames).toEqual(['login']);

    // 구독/리렌더/재조회는 새 ViewModel도 새 screen_view도 만들지 않는다.
    owner.getSnapshot();
    boot.viewModel.toLogin();
    expect(created).toHaveLength(1);
    expect(created[0].analytics.screenNames).toEqual(['login']);
  });

  it('login을 떠나면 ViewModel을 dispose하고 비운다, 다시 들어오면 새로 만든다', async () => {
    const { boot, owner, created } = setup();
    await boot.viewModel.start();
    boot.viewModel.toMain('guest');
    expect(owner.getSnapshot().viewModel).toBeNull();

    boot.viewModel.toLogin();
    expect(created).toHaveLength(2);
    expect(owner.getSnapshot().viewModel).toBe(created[1].viewModel);
    expect(created[1].analytics.screenNames).toEqual(['login']);
  });

  it('TC-AUTH-031 응답이 오기 전에 login을 떠나면 늦게 온 LOGIN_SUCCESS를 저장·이동하지 않는다', async () => {
    const { boot, owner, created } = setup();
    await boot.viewModel.start();
    const h = created[0];
    const gate = deferred<void>();
    h.transport.respond(async () => {
      await gate.promise;
      return fixtureResponse('auth/social-login__login-success');
    });
    const login = owner.getSnapshot().viewModel!.onKakaoPress();
    await flush();

    boot.viewModel.toMain('guest'); // 화면 이탈
    gate.resolve();
    await login;

    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
    expect(h.navigator.calls).toEqual([]);
    expect(h.push.registerCalls).toBe(0);
  });

  it('owner.dispose는 구독을 끊고 살아 있는 ViewModel도 dispose한다', async () => {
    const { boot, owner, created } = setup();
    await boot.viewModel.start();
    owner.dispose();
    boot.viewModel.toMain('guest');
    boot.viewModel.toLogin();
    expect(created).toHaveLength(1);
  });
});
