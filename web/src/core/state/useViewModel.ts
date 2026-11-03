import { useLayoutEffect, useReducer, useRef } from 'react';
import type { ViewModel } from './ViewModel';

/**
 * ViewModel 상태 구독. 구독을 레이아웃 효과에서 붙여 DOM이 화면에 나타나기 전에(같은 커밋 안에서) 끝낸다.
 * 구독 직후 렌더에서 읽은 상태와 지금 상태를 다시 비교하므로, 렌더와 구독 사이에 바뀐 값도 놓치지 않는다.
 */
export function useViewModel<S>(vm: ViewModel<S>): S {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const state = vm.state;
  const committed = useRef(state);
  useLayoutEffect(() => {
    committed.current = state;
  });
  useLayoutEffect(() => {
    const check = () => {
      if (!Object.is(vm.state, committed.current)) rerender();
    };
    const unsubscribe = vm.subscribe(check);
    check();
    return unsubscribe;
  }, [vm]);
  return state;
}
