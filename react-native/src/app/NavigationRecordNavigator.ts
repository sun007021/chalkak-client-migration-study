import type { NavigationContainerRef } from '@react-navigation/native';

import type { KstDate } from '../core/time/KstDate';
import type { RecordNavigator } from '../features/record/RecordNavigator';
import type { RootStackParamList } from './navigation/routes';

type NavigationRef = Pick<NavigationContainerRef<RootStackParamList>, 'isReady' | 'navigate'>;

/** RecordNavigator를 React Navigation으로 구현한다. */
export class NavigationRecordNavigator implements RecordNavigator {
  constructor(private readonly navigation: NavigationRef) {}

  openPostDetail(target: { postId: string; thumbnailUrl: string }): void {
    void this.navigation;
    void target;
    throw new Error('not implemented');
  }

  openDisplay(date: KstDate): void {
    void date;
    throw new Error('not implemented');
  }
}
