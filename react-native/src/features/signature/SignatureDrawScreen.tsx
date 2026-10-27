import { View } from 'react-native';

import type { SignatureMode } from './mapSignatureError';
import type { SignatureDrawViewModel } from './SignatureDrawViewModel';

export type SignatureDrawScreenProps = {
  viewModel: SignatureDrawViewModel;
  mode: SignatureMode;
  /** 화면/하드웨어 뒤로. */
  onBack: () => void;
};

/** testID는 testids.md의 signature.*. 상태는 구독만 하고 수명주기는 SignatureFlowViewModel이 가진다. */
export function SignatureDrawScreen(_props: SignatureDrawScreenProps) {
  return <View />;
}
