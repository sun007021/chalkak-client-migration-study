import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { makeHarness, renderApp } from '../../test/appHarness';
import { ME, loadFixture } from '../../test/fixtures';
import { EMPTY_SESSION } from '../../core/auth/SessionStore';

// 이 화면의 요소는 testids.md에 없으므로 data-testid 대신 role/label로 찾는다.
const refreshField = () => screen.getByRole('textbox', { name: 'Refresh token' });
const userIdField = () => screen.getByRole('textbox', { name: 'User ID' });
const submit = () => screen.getByRole('button', { name: '세션 주입' });

async function openDevSession(env = { DEV: true } as { DEV: boolean; VITE_ENABLE_DEV_SESSION?: string }) {
  const h = makeHarness({ env });
  const view = renderApp(h.container, '/dev/session');
  await screen.findByRole('button', { name: '세션 주입' });
  return { h, ...view };
}

function fill(refreshToken: string, userId: string) {
  fireEvent.change(refreshField(), { target: { value: refreshToken } });
  fireEvent.change(userIdField(), { target: { value: userId } });
}

describe('개발용 세션 주입 화면', () => {
  it('TC-AUTH-059 개발 빌드에서 refresh token과 userId 입력칸, "세션 주입" 버튼이 있다', async () => {
    await openDevSession();
    expect(refreshField()).toBeInTheDocument();
    expect(userIdField()).toBeInTheDocument();
    expect(submit()).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('TC-AUTH-059 VITE_ENABLE_DEV_SESSION=true 빌드에서도 화면이 있다', async () => {
    await openDevSession({ DEV: false, VITE_ENABLE_DEV_SESSION: 'true' });
    expect(submit()).toBeInTheDocument();
  });

  it('TC-AUTH-059 붙여 넣고 주입하면 POST /auth/refresh로 받은 토큰을 저장하고 메인(회원)으로 replace 이동한다', async () => {
    const { h, path, router } = await openDevSession();
    h.ff.route('POST /auth/refresh', () => loadFixture('auth/refresh__success.json').toResponse());
    fill('pasted-refresh-token', ME);
    fireEvent.click(submit());
    expect(await screen.findByTestId('home.root')).toHaveAttribute('data-mode', 'member');
    expect(path()).toBe('/home');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(JSON.parse(h.ff.callsTo('POST /auth/refresh')[0]!.body as string)).toEqual({ refreshToken: 'pasted-refresh-token' });
    const session = await h.store.read();
    expect(session.userId).toBe(ME);
    expect(session.tokens?.refreshToken).toBe('fixture-refresh-token-2');
  });

  it('TC-AUTH-059 입력이 비어 있으면 요청 없이 role=alert로 안내한다', async () => {
    const { h, path } = await openDevSession();
    fill('', ME);
    fireEvent.click(submit());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(h.ff.calls).toHaveLength(0);
    expect(path()).toBe('/dev/session');
  });

  it('TC-AUTH-059 서버가 거절(REAUTHENTICATION_REQUIRED)하면 alert를 보이고 세션을 저장하지 않으며 화면에 머문다', async () => {
    const { h, path } = await openDevSession();
    h.ff.route('POST /auth/refresh', () => loadFixture('auth/refresh__reauthentication-required.json').toResponse());
    fill('stale-token', ME);
    fireEvent.click(submit());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(await h.store.read()).toEqual(EMPTY_SESSION);
    expect(path()).toBe('/dev/session');
    expect(submit()).toBeEnabled();
  });

  it('TC-AUTH-059 5xx도 alert이고 다시 시도할 수 있다', async () => {
    const { h } = await openDevSession();
    h.ff.route('POST /auth/refresh', () => loadFixture('auth/refresh__internal-error.json').toResponse(), () => loadFixture('auth/refresh__success.json').toResponse());
    fill('pasted-refresh-token', ME);
    fireEvent.click(submit());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(submit());
    expect(await screen.findByTestId('home.root')).toBeInTheDocument();
  });

  it('TC-AUTH-059 진행 중에는 버튼이 비활성이고 연타해도 요청은 1회이다', async () => {
    const { h } = await openDevSession();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    h.ff.route('POST /auth/refresh', () => gate.then(() => loadFixture('auth/refresh__success.json').toResponse()));
    fill('pasted-refresh-token', ME);
    fireEvent.click(submit());
    fireEvent.click(submit());
    await waitFor(() => expect(submit()).toBeDisabled());
    await act(async () => release());
    await screen.findByTestId('home.root');
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(1);
  });

  it('TC-AUTH-059 개발 플래그가 꺼진 빌드에서는 /dev/session에 들어가도 화면이 없고 로그인으로 간다', async () => {
    const h = makeHarness({ env: { DEV: false } });
    const { path } = renderApp(h.container, '/dev/session');
    expect(await screen.findByTestId('login.root')).toBeInTheDocument();
    expect(path()).toBe('/login');
    expect(screen.queryByRole('textbox', { name: 'Refresh token' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '세션 주입' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('login.dev-bypass-button')).not.toBeInTheDocument();
  });
});
