import { render, screen } from '@testing-library/react-native';

import { FakeAnalyticsTracker } from '../core/analytics/__testing__/FakeAnalyticsTracker';
import { createNetHarness } from '../core/http/__testing__/createNetHarness';
import { FixtureRouter } from '../data/__testing__/FixtureRouter';
import { MEMBER_ROUTES, NOW } from '../features/home/__testing__/createHomeHarness';
import { GlassOverride } from '../shared/glass/glass';
import { App } from './App';

const OK = { ok: true, config: { apiBaseUrl: 'http://localhost:4010/api/v1/' } } as const;

async function renderApp(glass: boolean) {
  const net = createNetHarness();
  net.clock.set(NOW);
  await net.signIn();
  new FixtureRouter(MEMBER_ROUTES).install(net.transport);
  await render(
    <GlassOverride value={glass}>
      <App
        configResult={OK}
        overrides={{
          clock: net.clock,
          sessionStore: net.sessionStore,
          events: net.events,
          api: net.api,
          analytics: new FakeAnalyticsTracker(),
        }}
      />
    </GlassOverride>,
  );
  await screen.findByTestId('bottom-bar.root');
}

describe('하단 바 유리 분기', () => {
  it('유리면 블러 캡슐과 선택 렌즈가 있고 testID는 그대로다', async () => {
    await renderApp(true);
    expect(screen.getByTestId('mock-blur-view')).toBeOnTheScreen();
    expect(screen.getByTestId('bottom-bar.lens')).toBeOnTheScreen();
    expect(screen.getByTestId('bottom-bar.tab-home')).toBeSelected();
    expect(screen.getByTestId('bottom-bar.upload-button')).toBeOnTheScreen();
  });

  it('평면이면 블러도 렌즈도 없다', async () => {
    await renderApp(false);
    expect(screen.queryByTestId('mock-blur-view')).toBeNull();
    expect(screen.queryByTestId('bottom-bar.lens')).toBeNull();
    expect(screen.getByTestId('bottom-bar.tab-home')).toBeSelected();
  });
});
