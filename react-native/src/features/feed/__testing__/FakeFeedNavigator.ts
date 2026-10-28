import type { FeedNavigator } from '../FeedNavigator';

export class FakeFeedNavigator implements FeedNavigator {
  closeCount = 0;

  close(): void {
    this.closeCount += 1;
  }
}
