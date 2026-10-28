import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { App } from './App';
import { createAppRoutes } from './app/routes';
import { makeHarness } from './test/appHarness';
import { t } from './copy/ko';

describe('App', () => {
  it('주입받은 조립 결과(라우터)를 그린다', async () => {
    const { container } = makeHarness();
    const router = createMemoryRouter(createAppRoutes(container), { initialEntries: ['/'] });
    render(<App boot={{ kind: 'ready', router }} />);
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(await screen.findByTestId('login.root')).toBeInTheDocument();
  });

  it('REQ-NET-002 설정 오류면 common.error.config 화면을 보인다', () => {
    render(<App boot={{ kind: 'config_error' }} />);
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(t('common.error.config'));
  });
});
