import type { NavigationContainerRef } from '@react-navigation/native';

import type { KstDate } from '../core/time/KstDate';
import type { UploadNavigator, UploadSuccessParams } from '../features/upload/UploadNavigator';
import type { RootStackParamList } from './navigation/routes';

/** 내비게이션이 아직 준비되지 않았을 때의 이동 요청은 버린다. */
type NavigationRef = Pick<
  NavigationContainerRef<RootStackParamList>,
  'isReady' | 'navigate' | 'dispatch' | 'goBack'
>;

/**
 * UploadNavigator를 React Navigation으로 구현한다.
 * 라우트 이름은 `Upload`(params `{topicDate: 'yyyy-MM-dd'}`)와 `UploadSuccess`(params `{topicTitle, topicDate, moderationStatus}`)다.
 * routes.ts의 RootStackParamList에 `UploadSuccess`를 추가하고 `Upload`의 params를 바꾸는 것은 구현 단계의 일이다.
 */
export class NavigationUploadNavigator implements UploadNavigator {
  constructor(private readonly navigation: NavigationRef) {
    void this.navigation;
  }

  openUpload(entry: { topicDate: KstDate }): void {
    void entry;
    throw new Error('not implemented');
  }

  showSuccess(params: UploadSuccessParams): void {
    void params;
    throw new Error('not implemented');
  }

  close(): void {
    throw new Error('not implemented');
  }

  openDisplay(topicDate: KstDate): void {
    void topicDate;
    throw new Error('not implemented');
  }
}
