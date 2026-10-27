import { View } from 'react-native';

import type { UpdateDialogViewModel } from './UpdateDialogViewModel';

/** 닫을 수 없는 강제 업데이트 다이얼로그. testID update-gate.*. */
export function UpdateGateDialog(_props: { viewModel: UpdateDialogViewModel }) {
  return <View />;
}
