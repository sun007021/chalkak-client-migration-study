import type { ScreenName, TabDestination } from '../../constants';

export type AnalyticsEvent =
  | { name: 'screen_view'; params: { screen_name: ScreenName; screen_class?: string } }
  | { name: 'bottom_navigation_selected'; params: { destination: TabDestination } };

/** 분석 전송 인터페이스(D-22). 화면 코드는 이것(또는 AnalyticsReporter)만 안다. */
export interface AnalyticsTracker {
  track(event: AnalyticsEvent): void;
}

/** 테스트용. */
export class FakeAnalyticsTracker implements AnalyticsTracker {
  readonly events: AnalyticsEvent[] = [];
  track(event: AnalyticsEvent): void {
    this.events.push(event);
  }
}
