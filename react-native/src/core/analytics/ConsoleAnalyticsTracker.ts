import type { AnalyticsParams, AnalyticsTracker } from './AnalyticsTracker';

/** 기본 분석 구현: 로그만 남긴다(D-22). 토큰·nonce 같은 비밀값은 호출자가 params에 넣지 않는다. */
export class ConsoleAnalyticsTracker implements AnalyticsTracker {
  screenView(screenName: string): void {
    this.logEvent('screen_view', { screen_name: screenName });
  }

  logEvent(name: string, params: AnalyticsParams = {}): void {
    console.info(`[analytics] ${name}`, params);
  }
}
