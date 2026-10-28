import type { DateString } from '../core/time/kst';
import type { UploadNavigator } from '../features/upload/UploadNavigator';

export class FakeUploadNavigator implements UploadNavigator {
  readonly opened: { topicDate: DateString }[] = [];
  openUpload(target: { topicDate: DateString }): void {
    this.opened.push(target);
  }
}
