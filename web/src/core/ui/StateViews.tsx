import type { ReactNode } from 'react';
import { t } from '../../copy/ko';
import { Button } from './Button';
import { Skeleton } from './Skeleton';

/**
 * screenId는 testids.md의 화면 접두(예: 'home'). 요소 id는 `<screenId>.loading`.
 * 원본은 기본 스피너만 두지 않고 스켈레톤(쉬머)을 쓴다. 여기서는 목록·카드 자리를 닮은 쉬머 막대 묶음을 그린다(문구 없음).
 */
export function LoadingIndicator({ screenId, variant = 'block' }: { screenId: string; variant?: 'block' | 'overlay' | 'grid' }): ReactNode {
  if (variant === 'grid') {
    // 전시처럼 2열 카드 목록 자리(3:4 카드 4장).
    return (
      <div data-testid={`${screenId}.loading`} role="status" aria-busy="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', padding: 'var(--space-lg) var(--space-screen-horizontal)' }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} style={{ aspectRatio: '3 / 4', borderRadius: 'var(--radius-photo-card)' }} />
        ))}
      </div>
    );
  }
  if (variant === 'overlay') {
    // 화면 위를 덮는 로딩(로그인 요청 중 등): 터치를 막고 가운데에 쉬머 캡슐 하나만 보인다.
    return (
      <div data-testid={`${screenId}.loading`} role="status" aria-busy="true" className="ck-overlay" style={{ zIndex: 150, background: 'rgba(247, 246, 243, 0.6)' }}>
        <Skeleton style={{ width: 96, height: 8, borderRadius: 'var(--radius-pill)' }} />
      </div>
    );
  }
  return (
    <div data-testid={`${screenId}.loading`} role="status" aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', padding: 'var(--space-xl) var(--space-screen-horizontal)' }}>
      <Skeleton style={{ height: 20, width: '46%', borderRadius: 'var(--radius-small)' }} />
      <Skeleton style={{ height: 96, width: '100%', borderRadius: 'var(--radius-photo-card)' }} />
      <Skeleton style={{ height: 16, width: '72%', borderRadius: 'var(--radius-small)' }} />
    </div>
  );
}

/** `<screenId>.empty-state`. children이 문구(body, textSecondary). 가운데 정렬. */
export function EmptyState({ screenId, icon, children }: { screenId: string; icon?: ReactNode; children?: ReactNode }): ReactNode {
  return (
    <div data-testid={`${screenId}.empty-state`} className="ck-state ck-state__title" style={{ paddingTop: 96 }}>
      {icon ? <span aria-hidden="true" style={{ display: 'inline-flex', color: 'var(--color-icon-secondary)' }}>{icon}</span> : null}
      {children}
    </div>
  );
}

/** `<screenId>.error-state`(문구) + `<screenId>.retry-button`(common.retry). message 기본값은 common.error.generic. */
export function ErrorState({ screenId, message, onRetry }: { screenId: string; message?: string; onRetry: () => void }): ReactNode {
  return (
    <div className="ck-state" style={{ gap: 'var(--space-lg)' }}>
      <p data-testid={`${screenId}.error-state`} className="ck-state__title">
        {message ?? t('common.error.generic')}
      </p>
      <Button variant="outlined" compact data-testid={`${screenId}.retry-button`} onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  );
}
