import { useLayoutEffect, useRef, useState } from 'react';
import type { ViewModel } from './ViewModel';

type Owned<V> = { readonly create: () => V | null; readonly vm: V | null };

/**
 * 화면이 소유하는 ViewModel. 첫 렌더에서 동기로 만들어(지연 useState 초기값) 같은 커밋의 DOM이 곧바로 구독 가능한 ViewModel을 갖는다.
 * 효과에서 만들면 "null 렌더 → ViewModel 렌더(DOM 노출) → 구독 효과"로 DOM이 보인 뒤 구독 전의 틈이 생겨 그 사이의 입력·알림이 사라진다.
 *
 * - create는 안정적인 참조여야 한다(useCallback). 바뀌면(모드·키 변경) 새로 만들고 이전 것은 dispose한다. null을 돌려주면 vm은 null.
 * - create와 ViewModel 생성자는 부작용이 없어야 한다(요청·타이머·구독 금지): 렌더 중에 불리고, StrictMode나 버려지는 렌더에서는 쓰이지 않는 인스턴스가 생길 수 있다.
 *   일은 start(마운트 때 한 번, 만들어진 ViewModel로)에서 시작한다.
 * - 언마운트(효과 정리)에서 dispose한다. 단 dispose는 마이크로태스크로 한 틱 미룬다: StrictMode의 가짜 언마운트("효과 → 정리 → 효과")는 같은 호출 스택에서
 *   곧바로 효과를 다시 돌리므로 그때는 취소하고 같은 인스턴스를 다시 쓴다. 가짜 언마운트에서 인스턴스를 버리고 새로 만들면, React가 그 재실행을
 *   DOM이 보인 뒤(패시브 효과 단계)에 하므로 그 사이에 들어온 입력이 버려진 인스턴스에 쌓였다가 사라진다. (진짜 언마운트는 한 틱 뒤에 dispose된다.)
 *   그래도 dispose된 인스턴스를 만나면(누가 먼저 dispose했다면) 새로 만들어 연결한다.
 */
export function useOwnedViewModel<V extends ViewModel<unknown>>(create: () => V | null, start?: (vm: V) => void): V | null {
  const [owned, setOwned] = useState<Owned<V>>(() => ({ create, vm: create() }));
  let current = owned;
  if (owned.create !== create) {
    // create가 바뀌었다: 렌더 중 파생 상태 갱신. 이전 ViewModel은 아래 효과의 정리가 dispose한다.
    current = { create, vm: create() };
    setOwned(current);
  }
  const rendered = current.vm;
  const startRef = useRef(start);
  const renderedRef = useRef(rendered);
  useLayoutEffect(() => {
    startRef.current = start;
    renderedRef.current = rendered;
  });
  const liveRef = useRef<V | null>(null);
  const pendingRef = useRef<V | null>(null);
  useLayoutEffect(() => {
    let live = renderedRef.current;
    if (live && pendingRef.current === live) {
      // 가짜 언마운트 직후의 재실행: 예약된 dispose를 취소하고 그대로 쓴다. 이미 시작했으므로 start는 다시 부르지 않는다.
      pendingRef.current = null;
      liveRef.current = live;
    } else {
      if (live?.isDisposed) {
        live = create();
        setOwned({ create, vm: live });
      }
      liveRef.current = live;
      if (live) startRef.current?.(live);
    }
    return () => {
      const leaving = liveRef.current;
      liveRef.current = null;
      if (!leaving) return;
      pendingRef.current = leaving;
      void Promise.resolve().then(() => {
        if (pendingRef.current !== leaving) return;
        pendingRef.current = null;
        leaving.dispose();
      });
    };
  }, [create]);
  return current.vm;
}
