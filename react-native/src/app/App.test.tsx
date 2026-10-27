import { render, screen } from '@testing-library/react-native';

import { App } from './App';
import { AppContainer } from './AppContainer';
import { DEFAULT_API_BASE_URL } from '../core/config/AppConfig';

describe('App', () => {
  it('루트 내비게이터가 placeholder 화면을 그린다', async () => {
    const container = new AppContainer(
      { apiBaseUrl: DEFAULT_API_BASE_URL },
      { now: () => new Date(0) },
    );
    await render(<App container={container} />);
    expect(screen.getByTestId('placeholder.root')).toBeOnTheScreen();
  });
});
