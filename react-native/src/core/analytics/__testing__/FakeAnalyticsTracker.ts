import type { AnalyticsParams, AnalyticsTracker } from '../AnalyticsTracker';

export type RecordedAnalyticsEvent = { name: string; params: AnalyticsParams };

export class FakeAnalyticsTracker implements AnalyticsTracker {
  readonly events: RecordedAnalyticsEvent[] = [];

  screenView(screenName: string): void {
    this.events.push({ name: 'screen_view', params: { screen_name: screenName } });
  }

  logEvent(name: string, params: AnalyticsParams = {}): void {
    this.events.push({ name, params });
  }

  /** 기록된 screen_view의 화면 이름 목록. */
  get screenNames(): string[] {
    return this.events
      .filter((e) => e.name === 'screen_view')
      .map((e) => String(e.params.screen_name));
  }
}
