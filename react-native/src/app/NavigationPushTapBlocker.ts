import type { NavigationContainerRef } from '@react-navigation/native';

import type { PushTapBlocker } from '../features/push/PushTapBlocker';
import { PUSH_TAP_BLOCKING_ROUTES, type RootStackParamList } from './navigation/routes';

type NavigationRef = Pick<
  NavigationContainerRef<RootStackParamList>,
  'isReady' | 'getCurrentRoute' | 'addListener'
>;

const BLOCKING_ROUTES: ReadonlySet<string> = new Set(PUSH_TAP_BLOCKING_ROUTES);

/**
 * 푸시 탭을 보류하게 하는 조건: 내비게이션이 아직 준비되지 않았거나(콜드 스타트) 업로드 등 작성 화면이 열려 있다.
 * 준비되면 `notifyReady()`(컨테이너의 onReady)로 구독자에게 알려 보류분을 다시 처리하게 한다(REQ-PUSH-031).
 */
export class NavigationPushTapBlocker implements PushTapBlocker {
  private readonly listeners = new Set<() => void>();

  constructor(private readonly navigation: NavigationRef) {}

  isBlocked(): boolean {
    if (!this.navigation.isReady()) return true;
    const name = this.navigation.getCurrentRoute()?.name;
    return name !== undefined && BLOCKING_ROUTES.has(name);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    const stopState = this.navigation.addListener('state', listener);
    return () => {
      this.listeners.delete(listener);
      stopState();
    };
  }

  /** NavigationContainer의 onReady에서 부른다. */
  notifyReady(): void {
    [...this.listeners].forEach((listener) => listener());
  }
}
