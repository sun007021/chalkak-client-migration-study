import type { FeedbackNavigator } from '../FeedbackNavigator';

export class FakeFeedbackNavigator implements FeedbackNavigator {
  closes = 0;

  close(): void {
    this.closes += 1;
  }
}
