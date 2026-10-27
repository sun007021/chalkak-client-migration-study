import type { Logger } from '../net/Logger';
import type { AnalyticsEvent, AnalyticsTracker } from './AnalyticsTracker';

/** 기본 구현: 로그 출력만 한다(Firebase 설정 파일이 없는 빌드, Q-16). 로그 메시지는 `analytics <event.name>`, fields는 event.params. */
export class LogAnalyticsTracker implements AnalyticsTracker {
  constructor(_logger: Logger) {}
  track(_event: AnalyticsEvent): void {
    throw new Error('not implemented');
  }
}

/** 설정이 없으면 로그 구현을 돌려준다. Web 기본 빌드는 항상 이 경로(자동 page_view 없음). */
export function createAnalyticsTracker(_deps: { logger: Logger; firebaseConfig?: unknown }): AnalyticsTracker {
  throw new Error('not implemented');
}
