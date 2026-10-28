import type { DateString } from '../../core/time/kst';
import type { HomeNavigator } from './HomeNavigator';
import type { PostSummary } from './homeModels';

/**
 * 오래 사는 HomeViewModel이 화면 수명과 무관하게 들고 있는 HomeNavigator. 홈 화면이 붙어 있는 동안만 실제 구현(react-router navigate)을 꽂는다.
 * 붙어 있지 않을 때의 이동 요청은 버린다(화면이 없으면 사용자가 누를 수도 없다).
 */
export class AttachableHomeNavigator implements HomeNavigator {
  private target: HomeNavigator | null = null;

  /** 붙인다. 돌려준 함수로 뗀다(그 사이 다른 구현이 붙었으면 건드리지 않는다). */
  attach(target: HomeNavigator): () => void {
    this.target = target;
    return () => {
      if (this.target === target) this.target = null;
    };
  }

  openPostDetail(target: { postId: string; seed: PostSummary }): void {
    this.target?.openPostDetail(target);
  }
  openNotifications(): void {
    this.target?.openNotifications();
  }
  openDisplayPopular(date: DateString): void {
    this.target?.openDisplayPopular(date);
  }
  openRecord(selectedDate: DateString | null): void {
    this.target?.openRecord(selectedDate);
  }
  openAiReview(postId: string): void {
    this.target?.openAiReview(postId);
  }
}
