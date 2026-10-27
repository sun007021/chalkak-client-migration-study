import type { AnalyticsEvent, AnalyticsTracker } from '../core/analytics/AnalyticsTracker';

export class FakeAnalyticsTracker implements AnalyticsTracker {
  readonly events: AnalyticsEvent[] = [];
  track(event: AnalyticsEvent): void {
    this.events.push(event);
  }
}
