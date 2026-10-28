import { StackActions, type NavigationContainerRef } from '@react-navigation/native';

import type { NotificationNavigator } from '../features/notification/NotificationNavigator';
import type { RootStackParamList } from './navigation/routes';

/** 내비게이션이 준비되지 않았을 때의 이동은 버린다. 푸시 탭은 `PushTapBlocker`가 준비될 때까지 보류하므로 여기서 유실되지 않는다. */
type NavigationRef = Pick<
  NavigationContainerRef<RootStackParamList>,
  'isReady' | 'navigate' | 'dispatch' | 'getCurrentRoute'
>;

/** NotificationNavigator를 React Navigation으로 구현한다(D-11 목적지). */
export class NavigationNotificationNavigator implements NotificationNavigator {
  constructor(private readonly navigation: NavigationRef) {}

  openHome(): void {
    // React Navigation 7의 navigate는 기본으로 쌓는다. pop: true여야 스택에 이미 있는 Tabs까지 되돌아간다.
    if (this.navigation.isReady())
      this.navigation.navigate('Tabs', { screen: 'Home' }, { pop: true });
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
    // pop: true: 이미 알림함이 스택에 있으면 그 위의 화면만 닫고 새로 쌓지 않는다.
    if (this.navigation.isReady())
      this.navigation.navigate('Notifications', undefined, { pop: true });
  }
}
