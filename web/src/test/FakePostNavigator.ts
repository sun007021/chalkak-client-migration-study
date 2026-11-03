import type { PostSeed } from '../features/post/postModels';
import type { PostDetailNavigator } from '../features/post/postNavigation';
import type { FeedNavigator } from '../features/feed/FeedViewModel';

export class FakePostNavigator implements PostDetailNavigator {
  readonly calls: { postId: string; seed: PostSeed }[] = [];
  openPostDetail(target: { postId: string; seed: PostSeed }): void {
    this.calls.push(target);
  }
}

export class FakeFeedNavigator implements FeedNavigator {
  closes = 0;
  close(): void {
    this.closes += 1;
  }
}
