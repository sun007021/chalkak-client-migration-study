import { useEffect } from 'react';

/** bfcache(뒤로 가기 캐시)에서 페이지가 복원되면(pageshow + persisted) 콜백을 부른다. */
export function usePageRestore(onRestore: () => void): void {
  useEffect(() => {
    const handler = (event: PageTransitionEvent) => {
      if (event.persisted) onRestore();
    };
    window.addEventListener('pageshow', handler);
    return () => window.removeEventListener('pageshow', handler);
  }, [onRestore]);
}
