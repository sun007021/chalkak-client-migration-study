import type { NavigationContainerRef } from '@react-navigation/native';

import type { PushTapBlocker } from '../features/push/PushTapBlocker';
import type { RootStackParamList } from './navigation/routes';

type NavigationRef = Pick<
  NavigationContainerRef<RootStackParamList>,
  'isReady' | 'getCurrentRoute' | 'addListener'
>;

/** 작성 중인 내용을 보호하려고 푸시 탭 이동을 미루는 화면(업로드·사진 편집은 업로드 화면 안, 피드백). */
const BLOCKING_ROUTES: ReadonlySet<string> = new Set(['Upload', 'Feedback']);

/** 현재 화면이 업로드·피드백 작성 화면이면 푸시 탭을 보류하게 한다(REQ-PUSH-031). */
export class NavigationPushTapBlocker implements PushTapBlocker {
  constructor(private readonly navigation: NavigationRef) {}

  isBlocked(): boolean {
    if (!this.navigation.isReady()) return false;
    const name = this.navigation.getCurrentRoute()?.name;
    return name !== undefined && BLOCKING_ROUTES.has(name);
  }

  subscribe(listener: () => void): () => void {
    return this.navigation.addListener('state', listener);
  }
}
