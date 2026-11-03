import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { VisibilityObserverFactory } from './VisibilityObserver';

/** 목록 끝 근처에 놓는 1px 요소. 화면에 보이면(마운트 직후 이미 보이는 경우 포함) onVisible. 관찰 수단이 없으면 아무것도 하지 않는다. */
export function VisibilitySentinel({ onVisible, observe }: { onVisible: () => void; observe: VisibilityObserverFactory | null }): ReactNode {
  const ref = useRef<HTMLSpanElement | null>(null);
  const latest = useRef(onVisible);
  useEffect(() => {
    latest.current = onVisible;
  }, [onVisible]);
  const notify = useCallback(() => latest.current(), []);
  useEffect(() => {
    const element = ref.current;
    if (!element || !observe) return;
    const watch = observe(element, notify);
    return () => watch.disconnect();
  }, [observe, notify]);
  return <span ref={ref} aria-hidden="true" style={{ display: 'block', height: 1 }} />;
}
