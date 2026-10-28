import type { KstDate } from '../../../core/time/KstDate';
import type { UploadNavigator, UploadSuccessParams } from '../UploadNavigator';

export type UploadNavigatorCall =
  | { type: 'open-upload'; topicDate: string }
  | { type: 'show-success'; topicTitle: string; topicDate: string; moderationStatus: string }
  | { type: 'close' }
  | { type: 'open-display'; topicDate: string };

export class FakeUploadNavigator implements UploadNavigator {
  readonly calls: UploadNavigatorCall[] = [];

  openUpload(entry: { topicDate: KstDate }): void {
    this.calls.push({ type: 'open-upload', topicDate: entry.topicDate.toString() });
  }

  showSuccess(params: UploadSuccessParams): void {
    this.calls.push({
      type: 'show-success',
      topicTitle: params.topicTitle,
      topicDate: params.topicDate.toString(),
      moderationStatus: params.moderationStatus,
    });
  }

  close(): void {
    this.calls.push({ type: 'close' });
  }

  openDisplay(topicDate: KstDate): void {
    this.calls.push({ type: 'open-display', topicDate: topicDate.toString() });
  }

  ofType<T extends UploadNavigatorCall['type']>(type: T) {
    return this.calls.filter(
      (c): c is Extract<UploadNavigatorCall, { type: T }> => c.type === type,
    );
  }
}
