import { StackActions, type NavigationContainerRef } from '@react-navigation/native';

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
 * 성공 화면은 업로드 화면을 **바꿔서**(replace) 올리므로 뒤로 가도 업로드 화면으로 돌아오지 않는다.
 */
export class NavigationUploadNavigator implements UploadNavigator {
  constructor(private readonly navigation: NavigationRef) {}

  openUpload(entry: { topicDate: KstDate }): void {
    this.go((nav) => nav.navigate('Upload', { topicDate: entry.topicDate.toString() }));
  }

  showSuccess(params: UploadSuccessParams): void {
    this.go((nav) =>
      nav.dispatch(
        StackActions.replace('UploadSuccess', {
          topicTitle: params.topicTitle,
          topicDate: params.topicDate.toString(),
          moderationStatus: params.moderationStatus,
        }),
      ),
    );
  }

  close(): void {
    this.go((nav) => nav.goBack());
  }

  openDisplay(topicDate: KstDate): void {
    this.go((nav) =>
      nav.navigate('Tabs', { screen: 'Display', params: { date: topicDate.toString() } }),
    );
  }

  private go(action: (navigation: NavigationRef) => void): void {
    if (this.navigation.isReady()) action(this.navigation);
  }
}
