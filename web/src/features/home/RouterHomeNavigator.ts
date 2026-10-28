import { ROUTES, displayPath, feedPath, recordPath } from '../../app/paths';
import type { DateString } from '../../core/time/kst';
import type { TabHistoryState } from '../shell/tabs';
import type { HomeNavigator } from './HomeNavigator';
import type { PostSummary } from './homeModels';

export type NavigateFn = (to: string, options?: { state?: unknown }) => void | Promise<void>;

/** 홈 위에 다른 탭을 쌓을 때의 히스토리 state. 하단 바의 홈 → 다른 탭과 같은 규칙이라 뒤로 가기(POP)로 홈에 돌아온다. */
const HOME_BELOW: TabHistoryState = { homeBelow: true };

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
    void this.navigate(displayPath(date, 'popular'), { state: HOME_BELOW });
  }

  openRecord(selectedDate: DateString | null): void {
    void this.navigate(recordPath(selectedDate), { state: HOME_BELOW });
  }

  openAiReview(postId: string): void {
    void this.navigate(feedPath(postId), { state: { openAiReview: true } });
  }
}
