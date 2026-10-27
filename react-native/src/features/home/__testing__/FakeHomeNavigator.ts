import type { PostSummary } from '../../../data/post/PostModels';
import type { KstDate } from '../../../core/time/KstDate';
import type { HomeNavigator } from '../HomeNavigator';

export type HomeNavigatorCall =
  | { type: 'upload-gate' }
  | { type: 'post-detail'; postId: string; seed: PostSummary | null }
  | { type: 'notifications' }
  | { type: 'banner'; id: string; webViewUrl: string }
  | { type: 'display-popular'; date: string }
  | { type: 'record'; selectedDate: string | null };

export class FakeHomeNavigator implements HomeNavigator {
  readonly calls: HomeNavigatorCall[] = [];

  openUploadGate(): void {
    this.calls.push({ type: 'upload-gate' });
  }

  openPostDetail(target: { postId: string; seed: PostSummary | null }): void {
    this.calls.push({ type: 'post-detail', postId: target.postId, seed: target.seed });
  }

  openNotifications(): void {
    this.calls.push({ type: 'notifications' });
  }

  openBanner(banner: { id: string; webViewUrl: string }): void {
    this.calls.push({ type: 'banner', id: banner.id, webViewUrl: banner.webViewUrl });
  }

  openDisplayPopular(date: KstDate): void {
    this.calls.push({ type: 'display-popular', date: date.toString() });
  }

  openRecord(selectedDate: KstDate | null): void {
    this.calls.push({ type: 'record', selectedDate: selectedDate?.toString() ?? null });
  }
}
