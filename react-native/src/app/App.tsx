import { NavigationContainer } from '@react-navigation/native';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppContainer } from './AppContainer';
import { AppContainerProvider } from './AppContainerContext';
import { RootNavigator } from './RootNavigator';

export function App({ container }: { container?: AppContainer }) {
  const [appContainer] = useState(() => container ?? AppContainer.create());
  return (
    <SafeAreaProvider>
      <AppContainerProvider container={appContainer}>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </AppContainerProvider>
    </SafeAreaProvider>
  );
}
