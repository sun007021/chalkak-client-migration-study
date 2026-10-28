import type { PostSummary } from '../../../data/post/PostModels';
import type { DisplayNavigator } from '../DisplayNavigator';

export class FakeDisplayNavigator implements DisplayNavigator {
  readonly opened: { postId: string; seed: PostSummary }[] = [];

  openPostDetail(target: { postId: string; seed: PostSummary }): void {
    this.opened.push(target);
  }
}
