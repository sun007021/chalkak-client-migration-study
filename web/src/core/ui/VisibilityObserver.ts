export interface VisibilityWatch {
  disconnect(): void;
}

/** 요소가 화면에 보이면(관찰을 시작할 때 이미 보이고 있는 경우 포함) onVisible을 부른다. 테스트는 Fake를 주입한다. */
export type VisibilityObserverFactory = (target: Element, onVisible: () => void) => VisibilityWatch;

/** IntersectionObserver 기반 구현. 이 환경에 없으면 null(자동 다음 페이지 읽기를 끈다). */
export function createIntersectionVisibilityObserver(): VisibilityObserverFactory | null {
  if (typeof globalThis.IntersectionObserver === 'undefined') return null;
  return (target, onVisible) => {
    const observer = new globalThis.IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onVisible();
      },
      { rootMargin: '200px' },
    );
    observer.observe(target);
    return { disconnect: () => observer.disconnect() };
  };
}
