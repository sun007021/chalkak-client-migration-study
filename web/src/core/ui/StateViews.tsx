import type { ReactNode } from 'react';

/** screenId는 testids.md의 화면 접두(예: 'home'). 요소 id는 `<screenId>.loading`. */
export function LoadingIndicator(_props: { screenId: string }): ReactNode {
  throw new Error('not implemented');
}

/** `<screenId>.empty-state`. children이 문구. */
export function EmptyState(_props: { screenId: string; children?: ReactNode }): ReactNode {
  throw new Error('not implemented');
}

/** `<screenId>.error-state`(문구) + `<screenId>.retry-button`(common.retry). message 기본값은 common.error.generic. */
export function ErrorState(_props: { screenId: string; message?: string; onRetry: () => void }): ReactNode {
  throw new Error('not implemented');
}
