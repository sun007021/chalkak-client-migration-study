import { NavigationContainer } from '@react-navigation/native';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AppConfigResult } from '../core/config/AppConfig';
import { ConfigErrorScreen } from '../features/config/ConfigErrorScreen';
import { AppContainer, type Dependencies } from './AppContainer';
import { AppContainerProvider } from './AppContainerContext';
import { RootNavigator } from './RootNavigator';

type AppProps = {
  /** 앱 루트(`index.ts`)가 `readAppConfig()`로 읽은 결과. 이 컴포넌트는 전역을 읽지 않는다. */
  configResult: AppConfigResult;
  /** 테스트에서 fake를 주입한다. */
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
          <RootNavigator />
        </NavigationContainer>
      </AppContainerProvider>
    </SafeAreaProvider>
  );
}
