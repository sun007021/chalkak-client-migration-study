import type { NavigationContainerRef } from '@react-navigation/native';

import type { SettingsNavigator } from '../features/settings/SettingsNavigator';
import {
  FEEDBACK_ROUTE_NAME,
  SIGNATURE_CHANGE_ROUTE_NAME,
  type RootStackParamList,
} from './navigation/routes';

type NavigationRef = Pick<NavigationContainerRef<RootStackParamList>, 'isReady' | 'navigate'>;

/** SettingsNavigator를 React Navigation으로 구현한다. 준비되지 않았을 때(콜드 스타트 직후)의 이동 요청은 버린다. */
export class NavigationSettingsNavigator implements SettingsNavigator {
  constructor(private readonly navigation: NavigationRef) {}

  openFeedback(): void {
    if (this.navigation.isReady()) this.navigation.navigate(FEEDBACK_ROUTE_NAME);
  }

  openSignatureChange(): void {
    if (this.navigation.isReady()) this.navigation.navigate(SIGNATURE_CHANGE_ROUTE_NAME);
  }
}
