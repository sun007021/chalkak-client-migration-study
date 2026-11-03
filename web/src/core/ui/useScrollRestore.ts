import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { usePageRestore } from './usePageRestore';

/** 문서가 top까지 스크롤될 만큼 긴가(내용이 아직 덜 그려졌으면 false). */
const canReach = (top: number): boolean => document.documentElement.scrollHeight - window.innerHeight >= top;

/**
 * 화면의 스크롤 위치를 history 항목(location.key)별로 기억하고 되돌린다. 닫기 버튼과 브라우저 뒤로가기가 같은 항목으로 돌아오므로 같은 위치로 복원된다.
 * 브라우저 자동 복원은 꺼 두었다(disableBrowserScrollRestoration). 언마운트·pagehide에서 window.scrollY를 저장하고,
 * ready가 처음 true가 될 때(내용이 그려진 뒤) 저장된 값이 있으면 window.scrollTo({ top })한다. 그 값이 문서 높이를 넘으면(이미지·목록이 아직 덜 자람)
 * 다음 프레임에 한 번 더 시도한다. bfcache에서 복원되면(pageshow persisted) 저장된 위치를 다시 적용한다.
 */
export function useScrollRestore(ready: boolean): void {
  const { scrollMemory } = useContainer();
  const { key } = useLocation();
  const keyRef = useRef(key);
  const restored = useRef(false);
  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  const save = () => {
    // 아직 복원하지 못한 저장값(내용이 준비되기 전에 정리된 경우, StrictMode 포함)을 현재 위치(0)로 덮지 않는다.
    if (!restored.current && scrollMemory.read(keyRef.current) !== null) return;
    scrollMemory.save(keyRef.current, window.scrollY);
  };
  // 레이아웃 정리: 화면 요소가 DOM에서 빠져 브라우저가 스크롤을 줄여 놓기 전에 값을 읽는다.
  useLayoutEffect(
    () => () => save(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- save는 ref와 안정적인 scrollMemory만 쓴다
    [scrollMemory],
  );
  useEffect(() => {
    window.addEventListener('pagehide', save);
    return () => window.removeEventListener('pagehide', save);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 위와 같다
  }, [scrollMemory]);

  const apply = (): number | null => {
    const top = scrollMemory.read(keyRef.current);
    if (top === null || top <= 0) return null;
    window.scrollTo({ top });
    return top;
  };
  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const top = apply();
    if (top === null || canReach(top)) return;
    const frame = window.requestAnimationFrame(() => void apply());
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply는 ref와 안정적인 scrollMemory만 쓴다
  }, [ready, scrollMemory]);
  usePageRestore(() => {
    if (ready) void apply();
  });
}
