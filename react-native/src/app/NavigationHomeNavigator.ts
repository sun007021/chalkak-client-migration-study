import type { NavigationContainerRef } from '@react-navigation/native';

import type { KstDate } from '../core/time/KstDate';
import type { PostSummary } from '../data/post/PostModels';
import { toFeedSeed } from '../features/feed/FeedTarget';
import type { HomeNavigator } from '../features/home/HomeNavigator';
import type { RootStackParamList } from './navigation/routes';

/** 내비게이션이 아직 준비되지 않았을 때(콜드 스타트 직후)의 이동 요청은 버린다. */
type NavigationRef = Pick<NavigationContainerRef<RootStackParamList>, 'isReady' | 'navigate'>;

/** HomeNavigator를 React Navigation으로 구현한다. 아직 화면이 없는 목적지는 placeholder 화면으로 간다. */
export class NavigationHomeNavigator implements HomeNavigator {
  constructor(private readonly navigation: NavigationRef) {}

  openUploadGate(): void {
    this.go((nav) => nav.navigate('Upload'));
  }

  openPostDetail(target: { postId: string; seed: PostSummary | null }): void {
    this.go((nav) =>
      nav.navigate(
        'PostDetail',
        target.seed
          ? { postId: target.postId, seed: toFeedSeed(target.seed) }
          : { postId: target.postId },
      ),
    );
  }

  openNotifications(): void {
    this.go((nav) => nav.navigate('Notifications'));
  }

  openBanner(banner: { id: string; webViewUrl: string }): void {
    this.go((nav) => nav.navigate('IssueWeb', { url: banner.webViewUrl }));
  }

  openDisplayPopular(date: KstDate): void {
    this.go((nav) =>
      nav.navigate('Tabs', {
        screen: 'Display',
        params: { date: date.toString(), sort: 'popular' },
      }),
    );
  }

  openRecord(selectedDate: KstDate | null): void {
    this.go((nav) =>
      nav.navigate('Tabs', {
        screen: 'Record',
        params: { selectedDate: selectedDate?.toString() ?? null },
      }),
    );
  }

  private go(action: (navigation: NavigationRef) => void): void {
    if (this.navigation.isReady()) action(this.navigation);
  }
}
