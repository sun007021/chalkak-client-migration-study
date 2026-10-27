import { View } from 'react-native';

import type { IssueNavigationRequest } from './IssueNavigationPolicy';

export type IssueWebContentProps = {
  url: string;
  /** 바뀔 때마다 같은 주소를 처음부터 다시 로드한다. */
  reloadKey: number;
  onLoadEnd: () => void;
  onLoadError: () => void;
  /** true면 웹뷰 안에서 이동을 허용한다(react-native-webview의 onShouldStartLoadWithRequest에 연결). */
  onShouldStartLoad: (request: IssueNavigationRequest) => boolean;
};

/**
 * react-native-webview 어댑터 자리. 설치는 이 PR 범위 밖이므로 스텁은 빈 View다.
 * 화면 테스트는 이 컴포넌트를 prop으로 바꿔 끼워 콜백을 직접 호출한다.
 */
export function IssueWebContent(_props: IssueWebContentProps) {
  return <View />;
}
