import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { InProcessRefreshLock } from '../core/auth/RefreshLock';
import type { StoredSession } from '../core/auth/SessionStore';
import { createAppContainer } from '../app/container';
import type { AppContainer, AppEnv } from '../app/container';
import { createAppRoutes } from '../app/routes';
import { FakeAnalyticsTracker } from './FakeAnalyticsTracker';
import { FakeClock } from './FakeClock';
import { FakeHomePreloader } from './FakeHomePreloader';
import { FakeSessionStore } from './FakeSessionStore';
import { FakeSocialLoginClient } from './FakeSocialLoginClient';
import { FakeFetch } from './fakeFetch';
import { MOCK_BASE } from './apiEnv';
import { NOW, guestSession } from './fixtures';
import { RecordingLogger } from './RecordingLogger';
import { SequentialIdGenerator } from './sequentialIds';
import { EMPTY_SESSION } from '../core/auth/SessionStore';

export interface Harness {
  container: AppContainer;
  clock: FakeClock;
  ff: FakeFetch;
  store: FakeSessionStore;
  social: FakeSocialLoginClient;
  preloader: FakeHomePreloader;
  tracker: FakeAnalyticsTracker;
  logger: RecordingLogger;
}

/** 실제 구현을 엮되 시계·fetch·저장소·카카오·프리로드·분석만 Fake로 둔 앱 컨테이너. */
export function makeHarness(options: { session?: StoredSession; env?: Partial<AppEnv>; devSession?: boolean; resume?: (url: string) => Promise<{ idToken: string; rawNonce: string }> } = {}): Harness {
  const clock = new FakeClock(NOW);
  const ff = new FakeFetch();
  const store = new FakeSessionStore(options.session ?? EMPTY_SESSION);
  const social = new FakeSocialLoginClient();
  const preloader = new FakeHomePreloader().resolveImmediately();
  const tracker = new FakeAnalyticsTracker();
  const logger = new RecordingLogger();
  const container = createAppContainer({
    env: { VITE_API_BASE_URL: MOCK_BASE, ...options.env },
    devSessionEnabled: options.devSession ?? false,
    fetch: ff.fetch,
    clock,
    store,
    lock: new InProcessRefreshLock(),
    logger,
    tracker,
    ids: new SequentialIdGenerator(),
    socialLogin: social,
    resumeKakaoRedirect: options.resume,
    preloader,
  });
  return { container, clock, ff, store, social, preloader, tracker, logger };
}

/** 라우터를 만들어 그린다. router.state로 현재 경로·이동 방식(PUSH/REPLACE)을 확인한다. */
export function renderApp(container: AppContainer, initialPath = '/', options: { strict?: boolean } = {}) {
  const router = createMemoryRouter(createAppRoutes(container), { initialEntries: [initialPath] });
  const tree = <RouterProvider router={router} />;
  const view = render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
  return { router, ...view, path: () => router.state.location.pathname };
}

export { guestSession };
