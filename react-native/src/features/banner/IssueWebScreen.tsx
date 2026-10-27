import type { ComponentType } from 'react';
import { View } from 'react-native';

import type { IssueWebContentProps } from './IssueWebContent';
import type { IssueWebViewModel } from './IssueWebViewModel';

export type IssueWebScreenProps = {
  viewModel: IssueWebViewModel;
  onBack: () => void;
  /** 기본은 react-native-webview 어댑터. 테스트가 바꿔 끼운다. */
  WebContent?: ComponentType<IssueWebContentProps>;
};

/** testID는 docs/testing/testids.md의 issue.* 그대로. 제목은 항상 home.banner.title("ISSUE"). */
export function IssueWebScreen(_props: IssueWebScreenProps) {
  return <View />;
}
