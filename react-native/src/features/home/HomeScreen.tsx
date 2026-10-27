import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { HomeViewModel } from './HomeViewModel';

export type HomeScreenProps = {
  viewModel: HomeViewModel;
  /** AI 피드백 카드 본문. AI 리뷰 PR이 채운다. 홈은 `home.ai-card` 자리만 만든다. */
  renderAiCard?: (postId: string) => ReactNode;
};

/**
 * testID는 docs/testing/testids.md의 home.* 그대로. 마운트 시 viewModel.onShown(), 언마운트 시 onHidden()을 부른다.
 * 상태는 useViewModelState로 구독만 하고 분기 로직을 갖지 않는다.
 */
export function HomeScreen(_props: HomeScreenProps) {
  return <View />;
}
