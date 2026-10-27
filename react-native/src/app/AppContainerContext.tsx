import { createContext, type ReactNode, useContext } from 'react';

import type { AppContainer } from './AppContainer';

const AppContainerContext = createContext<AppContainer | null>(null);

export function AppContainerProvider({
  container,
  children,
}: {
  container: AppContainer;
  children: ReactNode;
}) {
  return <AppContainerContext.Provider value={container}>{children}</AppContainerContext.Provider>;
}

export function useAppContainer(): AppContainer {
  const container = useContext(AppContainerContext);
  if (!container) throw new Error('AppContainerProvider가 필요합니다');
  return container;
}
