import { useSyncExternalStore } from 'react';

import type { Observable } from './Observable';

/** ViewModel 상태를 구독만 하는 훅. 화면은 이 훅으로만 상태를 읽는다. */
export function useViewModelState<T>(viewModel: Observable<T>): T {
  return useSyncExternalStore(viewModel.subscribe, viewModel.getSnapshot, viewModel.getSnapshot);
}
