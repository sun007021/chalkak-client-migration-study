import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { BootViewModel } from '../features/boot/BootViewModel';
import type { UpdateDialogViewModel } from '../features/boot/UpdateDialogViewModel';

export type BootHostProps = {
  viewModel: BootViewModel;
  updateDialogViewModel: UpdateDialogViewModel;
  /** phase 'login'일 때만 렌더한다. */
  login: ReactNode;
  /** phase 'main'일 때만 렌더한다. */
  main: ReactNode;
};

/**
 * BootViewModel 상태에 따라 하나만 그린다: splash -> SplashView, update-required -> UpdateGateDialog(뒤 화면 없음),
 * login -> login, main -> main. 이전 단계가 끝나기 전에는 다음 화면을 마운트하지 않는다.
 */
export function BootHost(_props: BootHostProps) {
  return <View />;
}
