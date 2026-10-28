import type { FakeAnalyticsTracker } from './FakeAnalyticsTracker';

/** 기록된 screen_view의 screen_name을 순서대로. */
export const screenViews = (tracker: FakeAnalyticsTracker): string[] => tracker.events.flatMap((e) => (e.name === 'screen_view' ? [e.params.screen_name] : []));
