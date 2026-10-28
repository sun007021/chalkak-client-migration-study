import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { AppContainer } from './container';

const ContainerContext = createContext<AppContainer | null>(null);

export function ContainerProvider({ container, children }: { container: AppContainer; children: ReactNode }): ReactNode {
  return <ContainerContext.Provider value={container}>{children}</ContainerContext.Provider>;
}

export function useContainer(): AppContainer {
  const container = useContext(ContainerContext);
  if (!container) throw new Error('ContainerProvider가 필요합니다.');
  return container;
}
