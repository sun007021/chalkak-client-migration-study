import type { ReactNode } from 'react';
import type { AppContainer } from './container';

export function ContainerProvider(_props: { container: AppContainer; children: ReactNode }): ReactNode {
  throw new Error('not implemented');
}

export function useContainer(): AppContainer {
  throw new Error('not implemented');
}
