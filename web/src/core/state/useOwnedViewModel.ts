import { useEffect, useState } from 'react';
import type { ViewModel } from './ViewModel';

/**
 * 화면이 소유하는 ViewModel. 마운트(효과)마다 새로 만들고 언마운트에서 dispose한다.
 * StrictMode의 "마운트 → 정리 → 마운트"에서도 dispose된 인스턴스를 다시 쓰지 않도록 렌더가 아니라 효과에서 만든다.
 * create는 안정적인 참조여야 한다(useCallback). 만들어지기 전에는 null.
 */
export function useOwnedViewModel<V extends ViewModel<unknown>>(create: () => V): V | null {
  const [vm, setVm] = useState<V | null>(null);
  useEffect(() => {
    const next = create();
    // 효과에서 만든 외부 객체(ViewModel)를 화면에 연결하는 것이라 의도된 setState다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVm(next);
    return () => {
      next.dispose();
    };
  }, [create]);
  return vm;
}
