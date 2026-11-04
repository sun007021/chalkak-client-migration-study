import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/** 격자 한 줄의 높이(px). 카드 높이를 이 단위로 올림해 span으로 쌓는다. */
const ROW = 4;
const DEFAULT_COLUMN_WIDTH = 170;

const ColumnWidth = createContext<{ width: number; gap: number }>({ width: DEFAULT_COLUMN_WIDTH, gap: 12 });

/**
 * 2열 메이슨리(원본 DisplayPhotoGrid): DOM 순서는 게시물 순서 그대로 두고, 카드마다 높이에 맞는 grid-row span을 줘서
 * `grid-auto-flow: dense`가 짧은 열부터 채우게 한다(원본의 "항상 짧은 열에 다음 사진" 그리디 패킹과 같은 결과).
 * 폭은 ResizeObserver로 잰다(없으면 기본 폭). 자식은 MasonryItem.
 */
export function Masonry({ children, gap = 12, testId, style }: { children: ReactNode; gap?: number; testId?: string; style?: CSSProperties }): ReactNode {
  const ref = useRef<HTMLUListElement | null>(null);
  const [width, setWidth] = useState(DEFAULT_COLUMN_WIDTH);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth > 0) setWidth((el.clientWidth - gap) / 2);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [gap]);
  return (
    <ul
      ref={ref}
      data-testid={testId}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridAutoRows: ROW, gridAutoFlow: 'row dense', columnGap: gap, margin: 0, padding: 0, listStyle: 'none', ...style }}
    >
      <ColumnWidth.Provider value={{ width, gap }}>{children}</ColumnWidth.Provider>
    </ul>
  );
}

/** 메이슨리 칸. ratio는 세로/가로(원본 기본 4/3). 카드 높이 + 세로 간격 만큼 줄을 차지한다. 자식은 칸을 가득 채운다. */
export function MasonryItem({ ratio, extra = 0, children }: { ratio: number; /** 카드 아래 덧붙는 높이(px, 예: 하단 행). */ extra?: number; children: ReactNode }): ReactNode {
  const { width, gap } = useContext(ColumnWidth);
  const span = Math.max(1, Math.ceil((width * ratio + extra + gap) / ROW));
  return <li style={{ gridRowEnd: `span ${span}`, minWidth: 0 }}>{children}</li>;
}
