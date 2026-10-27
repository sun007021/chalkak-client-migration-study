import type { Logger } from '../net/Logger';
import type { AnalyticsEvent, AnalyticsTracker } from './AnalyticsTracker';

/** 기본 구현: 로그 출력만 한다(Firebase 설정 파일이 없는 빌드, Q-16). 로그 메시지는 `analytics <event.name>`, fields는 event.params. */
export class LogAnalyticsTracker implements AnalyticsTracker {
  constructor(private readonly logger: Logger) {}

  track(event: AnalyticsEvent): void {
    this.logger.log('info', `analytics ${event.name}`, { ...event.params });
  }
}
