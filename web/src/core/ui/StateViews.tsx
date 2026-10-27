import type { ReactNode } from 'react';
import { t } from '../../copy/ko';

/** screenId는 testids.md의 화면 접두(예: 'home'). 요소 id는 `<screenId>.loading`. 문구 없이 회전 스피너만 그린다. */
export function LoadingIndicator({ screenId }: { screenId: string }): ReactNode {
  return (
    <div data-testid={`${screenId}.loading`} role="status" aria-busy="true" style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="56 20" opacity="0.6">
          <animateTransform attributeName="transform" type="rotate" from="0 16 16" to="360 16 16" dur="0.9s" repeatCount="indefinite" />
        </circle>
      </svg>
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
