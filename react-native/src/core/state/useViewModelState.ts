import { useRef, useSyncExternalStore } from 'react';

import type { Observable } from './Observable';

interface Cache<T, S> {
  state: Readonly<T>;
  selector: (state: Readonly<T>) => S;
  value: S;
}

/**
 * ViewModel 상태를 구독만 하는 훅. 화면은 이 훅으로만 상태를 읽는다.
 *
 * `selector`를 주면 그 결과를 `Object.is`로 비교해 **결과가 바뀔 때만** 리렌더한다
 * (관련 없는 필드가 바뀌어도 리렌더하지 않는다). selector는 기본형 값이나 상태 안의 기존 참조를 돌려줘야 한다.
 * 호출마다 새 객체·배열을 만들어 돌려주면 매번 "바뀐 것"으로 보여 React가 무한 루프를 경고한다.
 */
export function useViewModelState<T>(viewModel: Observable<T>): Readonly<T>;
export function useViewModelState<T, S>(
  viewModel: Observable<T>,
  selector: (state: Readonly<T>) => S,
): S;
export function useViewModelState<T, S>(
  viewModel: Observable<T>,
  selector?: (state: Readonly<T>) => S,
): Readonly<T> | S {
  const cache = useRef<Cache<T, S> | null>(null);

  const getSelection = (): Readonly<T> | S => {
    const state = viewModel.getSnapshot();
    if (!selector) return state;
    const cached = cache.current;
    if (cached && cached.state === state && cached.selector === selector) return cached.value;
    const value = selector(state);
    // 상태는 바뀌었어도 선택 결과가 같으면 이전 참조를 돌려줘 리렌더를 막는다.
    const stable = cached && Object.is(cached.value, value) ? cached.value : value;
    cache.current = { state, selector, value: stable };
    return stable;
  };

  return useSyncExternalStore(viewModel.subscribe, getSelection, getSelection);
}
