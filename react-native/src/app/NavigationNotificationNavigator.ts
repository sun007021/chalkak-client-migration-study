import { StackActions, type NavigationContainerRef } from '@react-navigation/native';

import type { NotificationNavigator } from '../features/notification/NotificationNavigator';
import type { RootStackParamList } from './navigation/routes';

/** 내비게이션이 아직 준비되지 않았을 때(콜드 스타트 직후)의 이동 요청은 버린다. */
type NavigationRef = Pick<
  NavigationContainerRef<RootStackParamList>,
  'isReady' | 'navigate' | 'dispatch' | 'getCurrentRoute'
>;

/** NotificationNavigator를 React Navigation으로 구현한다(D-11 목적지). */
export class NavigationNotificationNavigator implements NotificationNavigator {
  constructor(private readonly navigation: NavigationRef) {}

  openHome(): void {
    // 이미 홈 탭이 스택 맨 아래에 있으면 위에 쌓인 화면만 걷어 내고 새로 쌓지 않는다.
    if (this.navigation.isReady()) this.navigation.navigate('Tabs', { screen: 'Home' });
  }

  openPostDetail(target: { postId: string; openAiSheet: boolean }): void {
    if (!this.navigation.isReady()) return;
    const params = {
      postId: target.postId,
      entry: 'mine' as const,
      ...(target.openAiSheet ? { openAiSheet: true } : {}),
    };
    const current = this.navigation.getCurrentRoute();
    const sameOpen =
      current?.name === 'PostDetail' &&
      (current.params as { postId?: string } | undefined)?.postId === target.postId;
    // 같은 게시물 상세가 이미 열려 있으면 새로 쌓지 않고 교체한다(REQ-NAV-031).
    if (sameOpen) this.navigation.dispatch(StackActions.replace('PostDetail', params));
    else this.navigation.navigate('PostDetail', params);
  }

  openNotificationDetail(notificationId: string): void {
    if (this.navigation.isReady())
      this.navigation.navigate('NotificationDetail', { notificationId });
  }

  openInbox(): void {
    // 이미 알림함이 아래에 있으면 그 위의 화면만 닫힌다.
    if (this.navigation.isReady()) this.navigation.navigate('Notifications');
  }
}
