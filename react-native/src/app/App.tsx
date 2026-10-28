import { NavigationContainer } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AppConfigResult } from '../core/config/AppConfig';
import { useViewModelState } from '../core/state/useViewModelState';
import { ToastHost } from '../core/toast/ToastHost';
import { LoginScreen } from '../features/auth/LoginScreen';
import { ConfigErrorScreen } from '../features/config/ConfigErrorScreen';
import { RnLegalDocWebView } from '../features/onboarding/RnLegalDocWebView';
import { SignUpRoute } from '../features/onboarding/SignUpRoute';
import { AppContainer, type Dependencies } from './AppContainer';
import { AppContainerProvider, useAppContainer } from './AppContainerContext';
import { BootHost } from './BootHost';
import { RootNavigator } from './RootNavigator';

type AppProps = {
  /** 앱 루트(`index.ts`)가 `readAppConfig()`로 읽은 결과. 이 컴포넌트는 전역을 읽지 않는다. */
  configResult: AppConfigResult;
  /** 앱 루트가 읽은 기능 플래그·앱 정보, 또는 테스트의 fake를 주입한다. */
  overrides?: Partial<Dependencies>;
};

export function App({ configResult, overrides }: AppProps) {
  const [container] = useState(() =>
    configResult.ok ? AppContainer.create(configResult.config, overrides) : null,
  );
  // 설정 오류면 컨테이너(네트워크 등)를 만들지 않으므로 요청이 나가지 않는다.
  if (!container) return <ConfigErrorScreen />;
  return (
    <SafeAreaProvider>
      <AppContainerProvider container={container}>
        <AppNavigation />
      </AppContainerProvider>
    </SafeAreaProvider>
  );
}

/** 내비게이션 컨테이너와 화면 위 오버레이(토스트). 내비게이션 핸들은 컨테이너(AppContainer)가 소유한다. */
function AppNavigation() {
  const { navigationHandle, toastCenter } = useAppContainer();
  return (
    <NavigationContainer ref={navigationHandle}>
      <AppShell />
      {toastCenter ? <ToastHost center={toastCenter} /> : null}
    </NavigationContainer>
  );
}

/** 시작 흐름을 구동하고(스플래시 -> 게이트 -> 로그인/메인) 화면을 BootHost에 맡긴다. */
function AppShell() {
  const container = useAppContainer();
  const { bootViewModel, updateDialogViewModel } = container;

  useEffect(() => {
    void bootViewModel.start();
    // iOS 계열: 앱이 다시 활성화될 때 강제 업데이트 재확인(REQ-BOOT). Android의 온라인 복귀 재확인은 연결 상태 모듈이 생기면 붙인다.
    const subscription =
      Platform.OS === 'ios'
        ? AppState.addEventListener('change', (state) => {
            if (state === 'active') void bootViewModel.onAppActive();
          })
        : null;
    return () => subscription?.remove();
  }, [bootViewModel]);

  return (
    <BootHost
      viewModel={bootViewModel}
      updateDialogViewModel={updateDialogViewModel}
      login={<LoginRoute />}
      main={<RootNavigator />}
      signUp={<SignUpFlowRoute />}
    />
  );
}

/** ViewModel은 소유자(loginOwner)가 phase에 맞춰 만들고 버린다. 이 컴포넌트는 받아서 그리기만 한다. */
function LoginRoute() {
  const { loginOwner } = useAppContainer();
  const { viewModel } = useViewModelState(loginOwner);
  return viewModel ? <LoginScreen viewModel={viewModel} /> : null;
}

/** 가입 흐름 ViewModel은 소유자(signUpFlowOwner)가 phase에 맞춰 만들고 버린다. */
function SignUpFlowRoute() {
  const { signUpFlowOwner } = useAppContainer();
  const { flow } = useViewModelState(signUpFlowOwner);
  return flow ? <SignUpRoute flow={flow} WebView={RnLegalDocWebView} /> : null;
}
