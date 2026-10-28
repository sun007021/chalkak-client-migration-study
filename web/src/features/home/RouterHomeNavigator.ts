import { HOME_BELOW_STATE, ROUTES, displayPath, feedPath, recordPath } from '../../app/paths';
import type { DateString } from '../../core/time/kst';
import type { HomeNavigator } from './HomeNavigator';
import type { PostSummary } from './homeModels';

export type NavigateFn = (to: string, options?: { state?: unknown }) => void | Promise<void>;

/** react-router navigate로 HomeNavigator 계약의 경로·state를 만든다. */
export class RouterHomeNavigator implements HomeNavigator {
  constructor(private readonly navigate: NavigateFn) {}

  openPostDetail(target: { postId: string; seed: PostSummary }): void {
    void this.navigate(feedPath(target.postId), { state: { seed: target.seed } });
  }

  openNotifications(): void {
    void this.navigate(ROUTES.notifications);
  }

  openDisplayPopular(date: DateString): void {
    void this.navigate(displayPath(date, 'popular'), { state: HOME_BELOW_STATE });
  }

  openRecord(selectedDate: DateString | null): void {
    void this.navigate(recordPath(selectedDate), { state: HOME_BELOW_STATE });
  }

  openAiReview(postId: string): void {
    void this.navigate(feedPath(postId), { state: { openAiReview: true } });
  }
}
