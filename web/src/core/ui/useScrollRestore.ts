import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useContainer } from '../../app/AppContext';

/**
 * 화면의 스크롤 위치를 history 항목(location.key)별로 기억하고 되돌린다. 닫기 버튼과 브라우저 뒤로가기가 같은 항목으로 돌아오므로 같은 위치로 복원된다.
 * 언마운트에서 window.scrollY를 저장하고, ready가 처음 true가 될 때(내용이 그려진 뒤) 저장된 값이 있으면 window.scrollTo({ top })한다.
 */
export function useScrollRestore(ready: boolean): void {
  const { scrollMemory } = useContainer();
  const { key } = useLocation();
  const keyRef = useRef(key);
  const restored = useRef(false);
  useEffect(() => {
    keyRef.current = key;
  }, [key]);
  // 레이아웃 정리: 화면 요소가 DOM에서 빠져 브라우저가 스크롤을 줄여 놓기 전에 값을 읽는다.
  useLayoutEffect(
    () => () => {
      // 아직 복원하지 못한 저장값(내용이 준비되기 전에 정리된 경우, StrictMode 포함)을 현재 위치(0)로 덮지 않는다.
      if (!restored.current && scrollMemory.read(keyRef.current) !== null) return;
      scrollMemory.save(keyRef.current, window.scrollY);
    },
    [scrollMemory],
  );
  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const top = scrollMemory.read(keyRef.current);
    if (top !== null && top > 0) window.scrollTo({ top });
  }, [ready, scrollMemory]);
}
