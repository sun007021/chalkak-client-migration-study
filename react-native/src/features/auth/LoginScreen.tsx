import { View } from 'react-native';

import type { LoginViewModel } from './LoginViewModel';

/** testID는 docs/testing/testids.md의 login.* 그대로. 상태는 useViewModelState로 구독만 한다. */
export function LoginScreen(_props: { viewModel: LoginViewModel }) {
  return <View />;
}
