import { color, font, radius, space } from '../../design/tokens';
import { Button } from '../../core/ui/Button';
import { Skeleton } from '../../core/ui/Skeleton';
import { BackButton, TopBar } from '../../core/ui/TopBar';
import { useCallback, useId } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useParams } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { t } from '../../copy/ko';
import { webOnlyCopy } from '../../copy/webOnly';
import { useScreenView } from '../../core/analytics/useScreenView';
import { useOwnedViewModel } from '../../core/state/useOwnedViewModel';
import { useViewModel } from '../../core/state/useViewModel';
import { ErrorState } from '../../core/ui/StateViews';
import type { NotificationDetail } from './notificationModels';
import { planBackToInbox } from './notificationNavigation';
import { useBackAction } from './useBackAction';
import type { NotificationDetailViewModel } from './NotificationDetailViewModel';

/** 알림 상세 화면(REQ-NOTI-023~027). 마운트마다 ViewModel을 새로 만들어 읽고, 읽음 처리는 하지 않는다. */
export function NotificationDetailScreen(): ReactNode {
  const { notificationId = '' } = useParams();
  const container = useContainer();
  useScreenView('notification_detail');
  const goBack = useBackAction(planBackToInbox);

  const create = useCallback(() => container.createNotificationDetailViewModel({ notificationId }), [container, notificationId]);
  const vm = useOwnedViewModel(create, startDetail);
  return <DetailView vm={vm} onBack={goBack} />;
}

function startDetail(vm: NotificationDetailViewModel): void {
  void vm.load();
}

const textStyle: CSSProperties = { whiteSpace: 'pre-wrap', overflowWrap: 'break-word' };

function DetailView({ vm, onBack }: { vm: NotificationDetailViewModel | null; onBack: () => void }): ReactNode {
  return (
    <div data-testid="notification-detail.root" className="ck-screen">
      <TopBar title={t('noti.detail.title')} titleTestId="notification-detail.screen-title" left={<BackButton testId="notification-detail.back-button" onClick={onBack} />} />
      {vm ? <DetailBody vm={vm} onBack={onBack} /> : <Loading />}
    </div>
  );
}

function Loading(): ReactNode {
  return (
    <div data-testid="notification-detail.loading" role="status" aria-busy="true" aria-label={t('noti.inbox.loading')} style={{ display: 'flex', flexDirection: 'column', gap: space.md, padding: `${space.lg} var(--space-screen-horizontal)` }}>
      <Skeleton style={{ height: 22, width: '60%', borderRadius: radius.small }} />
      <Skeleton style={{ height: 16, width: '90%', borderRadius: radius.small }} />
      <Skeleton style={{ aspectRatio: '4 / 3', borderRadius: radius.photoCard }} />
    </div>
  );
}

function DetailBody({ vm, onBack }: { vm: NotificationDetailViewModel; onBack: () => void }): ReactNode {
  const { body } = useViewModel(vm);
  if (body.status === 'loading') return <Loading />;
  if (body.status === 'gone') {
    return (
      <p data-testid="notification-detail.not-found-state" role="status" className="ck-state ck-state__title" style={{ paddingTop: 96 }}>
        {t('noti.gone')}
      </p>
    );
  }
  if (body.status === 'error') return <ErrorState screenId="notification-detail" message={body.network ? t('noti.network') : t('noti.detail.error')} onRetry={() => void vm.retry()} />;
  return <DetailContent detail={body.detail} onBackToInbox={onBack} />;
}

function DetailContent({ detail, onBackToInbox }: { detail: NotificationDetail; onBackToInbox: () => void }): ReactNode {
  const reasonId = useId();
  const rejected = detail.type === 'POST_REJECTED';
  return (
    <article style={{ padding: `${space.sm} var(--space-screen-horizontal) ${space.xl}` }}>
      <h2 data-testid="notification-detail.title" style={{ margin: 0, ...font('title3'), ...textStyle }}>
        {detail.title}
      </h2>
      <p data-testid="notification-detail.body" style={{ margin: `${space.sm} 0 ${space.lg}`, color: color.textSecondary, ...font('callout'), ...textStyle }}>
        {detail.body}
      </p>
      {detail.type !== 'NOTICE' && detail.originalImageUrl ? (
        <img data-testid="notification-detail.photo" src={detail.originalImageUrl} alt={webOnlyCopy['noti.detail.photo-alt']} style={{ display: 'block', width: '100%', borderRadius: radius.photoCard, background: color.calendarCell }} />
      ) : null}
      {rejected && detail.rejectionReason ? (
        <section data-testid="notification-detail.rejection-section" aria-labelledby={reasonId} style={{ marginTop: space.lg, padding: space.lg, borderRadius: radius.large, background: color.surfaceElevated, border: `1px solid ${color.border}` }}>
          <h3 id={reasonId} style={{ margin: `0 0 ${space.xs}`, ...font('footnote'), fontWeight: 600 }}>
            {t('noti.detail.reason')}
          </h3>
          <p data-testid="notification-detail.rejection-reason" style={{ margin: 0, color: color.textSecondary, ...font('subheadline'), ...textStyle }}>
            {detail.rejectionReason}
          </p>
        </section>
      ) : null}
      {rejected ? (
        <div style={{ marginTop: space.xl }}>
          <Button fill data-testid="notification-detail.back-to-inbox-button" onClick={onBackToInbox}>
            {t('noti.detail.to-inbox')}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
