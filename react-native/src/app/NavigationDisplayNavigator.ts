import type { NavigationContainerRef } from '@react-navigation/native';

import type { PostSummary } from '../data/post/PostModels';
import type { DisplayNavigator } from '../features/display/DisplayNavigator';
import { toFeedSeed } from '../features/feed/FeedTarget';
import type { RootStackParamList } from './navigation/routes';

type NavigationRef = Pick<NavigationContainerRef<RootStackParamList>, 'isReady' | 'navigate'>;

/** DisplayNavigator를 React Navigation으로 구현한다. 상세 라우트에는 직렬화 가능한 시드(FeedSeed)를 싣는다. */
export class NavigationDisplayNavigator implements DisplayNavigator {
  constructor(private readonly navigation: NavigationRef) {}

  openPostDetail(target: { postId: string; seed: PostSummary }): void {
    if (!this.navigation.isReady()) return;
    this.navigation.navigate('PostDetail', {
      postId: target.postId,
      seed: toFeedSeed(target.seed),
    });
  }
}
