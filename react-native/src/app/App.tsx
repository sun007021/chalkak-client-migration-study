import { NavigationContainer } from '@react-navigation/native';
import { useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AppConfigResult } from '../core/config/AppConfig';
import { LoginScreen } from '../features/auth/LoginScreen';
import { ConfigErrorScreen } from '../features/config/ConfigErrorScreen';
import { PlaceholderScreen } from '../features/placeholder/PlaceholderScreen';
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
        <NavigationContainer>
          <AppShell />
        </NavigationContainer>
      </AppContainerProvider>
    </SafeAreaProvider>
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
      signUp={<PlaceholderScreen />}
    />
  );
}

/** 로그인 화면이 열릴 때마다 새 ViewModel을 만든다(화면이 사라지면 LoginScreen이 dispose). */
function LoginRoute() {
  const container = useAppContainer();
  const viewModel = useMemo(() => container.createLoginViewModel(), [container]);
  return <LoginScreen viewModel={viewModel} />;
}
