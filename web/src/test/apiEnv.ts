import { ApiClient } from '../core/net/ApiClient';
import { AuthCoordinator } from '../core/net/AuthCoordinator';
import { HttpTokenRefresher } from '../core/net/TokenRefresher';
import { RecordingLogger } from './RecordingLogger';
import { parseApiBaseUrl } from '../core/config/apiBaseUrl';
import { InProcessRefreshLock } from '../core/auth/RefreshLock';
import { FakeSessionStore } from './FakeSessionStore';
import type { StoredSession } from '../core/auth/SessionStore';
import { FakeClock } from './FakeClock';
import { FakeFetch } from './fakeFetch';
import { NOW, guestSession } from './fixtures';

export const MOCK_BASE = 'https://mock.local';

/** ApiClient + AuthCoordinator + HttpTokenRefresher를 실제 구현으로 엮고 fetch·시계·저장소만 Fake로 둔 통합 환경. */
export function makeApiEnv(session: StoredSession = guestSession, baseUrl: string = MOCK_BASE) {
  const clock = new FakeClock(NOW);
  const ff = new FakeFetch();
  const store = new FakeSessionStore(session);
  const logger = new RecordingLogger();
  const expired = { count: 0 };
  const refresher = new HttpTokenRefresher({ fetch: ff.fetch, clock, baseUrl: parseApiBaseUrl(baseUrl), logger });
  const auth = new AuthCoordinator({ store, refresher, clock, lock: new InProcessRefreshLock(), onSessionExpired: () => (expired.count += 1) });
  const client = () => new ApiClient({ baseUrl: parseApiBaseUrl(baseUrl), fetch: ff.fetch, clock, auth, logger });
  return { clock, ff, store, logger, expired, client };
}
