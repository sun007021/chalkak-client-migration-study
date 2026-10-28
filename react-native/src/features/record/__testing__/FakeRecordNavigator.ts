import type { KstDate } from '../../../core/time/KstDate';
import type { RecordNavigator } from '../RecordNavigator';

export class FakeRecordNavigator implements RecordNavigator {
  readonly details: { postId: string; thumbnailUrl: string }[] = [];
  readonly displays: string[] = [];

  openPostDetail(target: { postId: string; thumbnailUrl: string }): void {
    this.details.push(target);
  }

  openDisplay(date: KstDate): void {
    this.displays.push(date.toString());
  }
}
