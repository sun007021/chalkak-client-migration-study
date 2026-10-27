import { render, screen } from '@testing-library/react-native';

import { App } from './App';
import { FakeClock } from '../core/time/FakeClock';

const OK = { ok: true, config: { apiBaseUrl: 'http://localhost:4010/api/v1/' } } as const;

describe('App', () => {
  it('루트 내비게이터가 placeholder 화면을 그린다', async () => {
    await render(<App configResult={OK} overrides={{ clock: new FakeClock(new Date(0)) }} />);
    expect(screen.getByTestId('placeholder.root')).toBeOnTheScreen();
  });

  it('TC-NET-050 설정 오류면 common.error.config 화면만 보이고 내비게이터는 뜨지 않는다', async () => {
    await render(<App configResult={{ ok: false, error: 'config' }} />);
    expect(screen.getByTestId('config-error.error-state')).toHaveTextContent(
      'API 설정을 확인해 주세요.',
    );
    expect(screen.queryByTestId('placeholder.root')).not.toBeOnTheScreen();
  });
});
