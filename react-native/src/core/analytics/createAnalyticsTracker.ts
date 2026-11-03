import type { AnalyticsBackend } from './AnalyticsBackend';
import type { AnalyticsTracker } from './AnalyticsTracker';
import { BackendAnalyticsTracker } from './BackendAnalyticsTracker';
import { ConsoleAnalyticsTracker } from './ConsoleAnalyticsTracker';

/** 백엔드(Firebase 설정이 있을 때만)가 있으면 그쪽으로, 없으면 로그 출력으로 보낸다. 앱 시작은 어느 쪽이든 정상이다. */
export function createAnalyticsTracker(backend: AnalyticsBackend | null): AnalyticsTracker {
  return backend === null ? new ConsoleAnalyticsTracker() : new BackendAnalyticsTracker(backend);
}
