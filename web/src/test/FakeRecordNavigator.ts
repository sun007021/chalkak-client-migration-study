import type { DateString } from '../core/time/kst';
import type { RecordNavigator } from '../features/record/recordNavigation';

export type RecordNavigatorCall = { type: 'feed'; postId: string; thumbnailImageUrl: string } | { type: 'display'; date: DateString };

export class FakeRecordNavigator implements RecordNavigator {
  readonly calls: RecordNavigatorCall[] = [];

  openFeed(target: { postId: string; thumbnailImageUrl: string }): void {
    this.calls.push({ type: 'feed', ...target });
  }

  openDisplay(date: DateString): void {
    this.calls.push({ type: 'display', date });
  }
}
