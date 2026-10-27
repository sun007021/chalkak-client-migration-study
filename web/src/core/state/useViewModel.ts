import { useCallback, useSyncExternalStore } from 'react';
import type { ViewModel } from './ViewModel';

export function useViewModel<S>(vm: ViewModel<S>): S {
  const subscribe = useCallback((listener: () => void) => vm.subscribe(listener), [vm]);
  const getSnapshot = useCallback(() => vm.state, [vm]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
