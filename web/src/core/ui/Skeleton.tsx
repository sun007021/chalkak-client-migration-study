import type { CSSProperties, ReactNode } from 'react';

/**
 * 쉬머 스켈레톤(원본 ChalkakSkeleton): skeletonBase 바탕 위로 skeletonHighlight 띠(폭 60%)가 1.2초 linear로 왼쪽→오른쪽 반복.
 * 모서리·크기는 호출부가 정한다(style). 움직임 줄이기 설정이면 띠 없이 바탕색만 보인다(global.css).
 */
export function Skeleton({ style, className = '', testId }: { style?: CSSProperties; className?: string; testId?: string }): ReactNode {
  return <div className={`ck-skeleton ${className}`.trim()} style={style} data-testid={testId} aria-hidden="true" />;
}
