import { render, screen } from '@testing-library/react-native';

import { App } from './App';
import { FakeSecureKeyValueStorage } from '../core/session/__testing__/FakeSecureKeyValueStorage';
import { SecureSessionStore } from '../core/session/SecureSessionStore';
import { FakeClock } from '../core/time/FakeClock';

const OK = { ok: true, config: { apiBaseUrl: 'http://localhost:4010/api/v1/' } } as const;

describe('App', () => {
  it('로그인된 세션이면 스플래시 뒤에 루트 내비게이터가 placeholder 화면을 그린다', async () => {
    const clock = new FakeClock(new Date(0));
    const sessionStore = new SecureSessionStore(new FakeSecureKeyValueStorage());
    await sessionStore.saveAuthenticated({
      userId: 'user-a',
      accessToken: 'access',
      accessTokenExpiresAt: new Date(900_000),
      refreshToken: 'refresh',
      refreshTokenExpiresAt: new Date(2_592_000_000),
    });
    await render(<App configResult={OK} overrides={{ clock, sessionStore }} />);
    expect(await screen.findByTestId('placeholder.root')).toBeOnTheScreen();
  });

  it('세션이 없으면 로그인 화면이 열린다', async () => {
    const sessionStore = new SecureSessionStore(new FakeSecureKeyValueStorage());
    await render(<App configResult={OK} overrides={{ sessionStore }} />);
    expect(await screen.findByTestId('login.root')).toBeOnTheScreen();
    expect(screen.queryByTestId('placeholder.root')).not.toBeOnTheScreen();
  });

  it('TC-NET-050 설정 오류면 common.error.config 화면만 보이고 내비게이터는 뜨지 않는다', async () => {
    await render(<App configResult={{ ok: false, error: 'config' }} />);
    expect(screen.getByTestId('config-error.error-state')).toHaveTextContent(
      'API 설정을 확인해 주세요.',
    );
    expect(screen.queryByTestId('placeholder.root')).not.toBeOnTheScreen();
  });
});
