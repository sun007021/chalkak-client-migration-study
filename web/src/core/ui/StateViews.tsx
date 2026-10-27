import type { ReactNode } from 'react';
import { t } from '../../copy/ko';

/** screenId는 testids.md의 화면 접두(예: 'home'). 요소 id는 `<screenId>.loading`. */
export function LoadingIndicator({ screenId }: { screenId: string }): ReactNode {
  return (
    <div data-testid={`${screenId}.loading`} role="progressbar" aria-busy="true" aria-label="loading">
      ...
    </div>
  );
}

/** `<screenId>.empty-state`. children이 문구. */
export function EmptyState({ screenId, children }: { screenId: string; children?: ReactNode }): ReactNode {
  return <div data-testid={`${screenId}.empty-state`}>{children}</div>;
}

/** `<screenId>.error-state`(문구) + `<screenId>.retry-button`(common.retry). message 기본값은 common.error.generic. */
export function ErrorState({ screenId, message, onRetry }: { screenId: string; message?: string; onRetry: () => void }): ReactNode {
  return (
    <div>
      <p data-testid={`${screenId}.error-state`}>{message ?? t('common.error.generic')}</p>
      <button type="button" data-testid={`${screenId}.retry-button`} onClick={onRetry}>
        {t('common.retry')}
      </button>
    </div>
  );
}
