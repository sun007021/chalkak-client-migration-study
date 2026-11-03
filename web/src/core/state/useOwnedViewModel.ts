import { useEffect, useRef, useState } from 'react';
import type { ViewModel } from './ViewModel';

type Owned<V> = { readonly create: () => V | null; readonly vm: V | null };

/**
 * 화면이 소유하는 ViewModel. 첫 렌더에서 동기로 만들어(지연 useState 초기값) 같은 커밋의 DOM이 곧바로 구독 가능한 ViewModel을 갖는다.
 * 효과에서 만들면 "null 렌더 → ViewModel 렌더(DOM 노출) → 구독 효과"로 DOM이 보인 뒤 구독 전의 틈이 생겨 그 사이의 입력·알림이 사라진다.
 *
 * - create는 안정적인 참조여야 한다(useCallback). 바뀌면(모드·키 변경) 새로 만들고 이전 것은 dispose한다. null을 돌려주면 vm은 null.
 * - create와 ViewModel 생성자는 부작용이 없어야 한다(요청·타이머·구독 금지): 렌더 중에 불리고, StrictMode나 버려지는 렌더에서는 쓰이지 않는 인스턴스가 생길 수 있다.
 *   일은 start(효과에서 마운트마다 한 번, 만들어진 ViewModel로)에서 시작한다.
 * - 언마운트(효과 정리)에서 dispose한다. StrictMode의 "효과 → 정리 → 효과"에서는 dispose된 인스턴스를 되살리지 않고 새로 만든다.
 */
export function useOwnedViewModel<V extends ViewModel<unknown>>(create: () => V | null, start?: (vm: V) => void): V | null {
  const [owned, setOwned] = useState<Owned<V>>(() => ({ create, vm: create() }));
  let current = owned;
  if (owned.create !== create) {
    // create가 바뀌었다: 렌더 중 파생 상태 갱신. 이전 ViewModel은 아래 효과의 정리가 dispose한다.
    current = { create, vm: create() };
    setOwned(current);
  }
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });
  const liveRef = useRef<V | null>(null);
  const rendered = current.vm;
  const renderedRef = useRef(rendered);
  useEffect(() => {
    renderedRef.current = rendered;
  });
  useEffect(() => {
    let live = renderedRef.current;
    if (live?.isDisposed) {
      // StrictMode가 정리를 먼저 돌렸다: 새로 만들어 화면에 연결한다(같은 create라 이 효과는 다시 돌지 않는다).
      live = create();
      setOwned({ create, vm: live });
    }
    liveRef.current = live;
    if (live) startRef.current?.(live);
    return () => {
      liveRef.current?.dispose();
      liveRef.current = null;
    };
  }, [create]);
  return current.vm;
}
