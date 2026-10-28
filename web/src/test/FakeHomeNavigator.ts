import type { DateString } from '../core/time/kst';
import type { HomeNavigator } from '../features/home/HomeNavigator';
import type { PostSummary } from '../features/home/homeModels';

export type HomeNavigatorCall =
  | { type: 'post-detail'; postId: string; seed: PostSummary }
  | { type: 'notifications' }
  | { type: 'display-popular'; date: DateString }
  | { type: 'record'; selectedDate: DateString | null }
  | { type: 'ai-review'; postId: string };

export class FakeHomeNavigator implements HomeNavigator {
  readonly calls: HomeNavigatorCall[] = [];

  openPostDetail(target: { postId: string; seed: PostSummary }): void {
    this.calls.push({ type: 'post-detail', postId: target.postId, seed: target.seed });
  }
  openNotifications(): void {
    this.calls.push({ type: 'notifications' });
  }
  openDisplayPopular(date: DateString): void {
    this.calls.push({ type: 'display-popular', date });
  }
  openRecord(selectedDate: DateString | null): void {
    this.calls.push({ type: 'record', selectedDate });
  }
  openAiReview(postId: string): void {
    this.calls.push({ type: 'ai-review', postId });
  }
}
