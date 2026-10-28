import type { NavigationContainerRef } from '@react-navigation/native';

import type { KstDate } from '../core/time/KstDate';
import type { RecordNavigator } from '../features/record/RecordNavigator';
import type { RootStackParamList } from './navigation/routes';

type NavigationRef = Pick<NavigationContainerRef<RootStackParamList>, 'isReady' | 'navigate'>;

/** RecordNavigator를 React Navigation으로 구현한다. */
export class NavigationRecordNavigator implements RecordNavigator {
  constructor(private readonly navigation: NavigationRef) {}

  /** 내 게시물 상세. 탭 내비게이터가 history 백 동작이라 상세에서 뒤로 가면 기록으로 돌아온다. */
  openPostDetail(target: { postId: string; thumbnailUrl: string }): void {
    this.go((nav) =>
      nav.navigate('PostDetail', {
        postId: target.postId,
        entry: 'mine',
        thumbnailUrl: target.thumbnailUrl,
      }),
    );
  }

  /** 전시 탭을 그 날짜로 연다. 전시에서 뒤로 가면 기록으로 돌아온다(REQ-NAV-030, 탭 history 백 동작). */
  openDisplay(date: KstDate): void {
    this.go((nav) =>
      nav.navigate('Tabs', { screen: 'Display', params: { date: date.toString() } }),
    );
  }

  /** 내비게이션이 아직 준비되지 않았을 때(콜드 스타트 직후)의 이동 요청은 버린다. */
  private go(action: (navigation: NavigationRef) => void): void {
    if (this.navigation.isReady()) action(this.navigation);
  }
}
