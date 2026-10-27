import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useViewModelState } from '../core/state/useViewModelState';
import type { BootViewModel } from '../features/boot/BootViewModel';
import { SplashView } from '../features/boot/SplashView';
import { UpdateGateDialog } from '../features/boot/UpdateGateDialog';
import type { UpdateDialogViewModel } from '../features/boot/UpdateDialogViewModel';

export type BootHostProps = {
  viewModel: BootViewModel;
  updateDialogViewModel: UpdateDialogViewModel;
  /** phase 'login'일 때만 렌더한다. */
  login: ReactNode;
  /** phase 'main'일 때만 렌더한다. */
  main: ReactNode;
  /** phase 'sign-up'일 때만 렌더한다(가입 화면은 다음 PR). */
  signUp?: ReactNode;
};

/**
 * BootViewModel 상태에 따라 하나만 그린다: splash -> SplashView, update-required -> UpdateGateDialog(뒤 화면 없음),
 * login -> login, main -> main. 이전 단계가 끝나기 전에는 다음 화면을 마운트하지 않는다.
 */
export function BootHost({ viewModel, updateDialogViewModel, login, main, signUp }: BootHostProps) {
  const { phase } = useViewModelState(viewModel);
  switch (phase) {
    case 'splash':
      return <SplashView />;
    case 'update-required':
      return (
        <View style={{ flex: 1 }}>
          <UpdateGateDialog viewModel={updateDialogViewModel} />
        </View>
      );
    case 'login':
      return <>{login}</>;
    case 'sign-up':
      return <>{signUp ?? null}</>;
    case 'main':
      return <>{main}</>;
  }
}
