import { useCallback, useEffect, useId, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { t } from '../../copy/ko';
import { webOnlyCopy } from '../../copy/webOnly';
import { useScreenView } from '../../core/analytics/useScreenView';
import { useOwnedViewModel } from '../../core/state/useOwnedViewModel';
import { useViewModel } from '../../core/state/useViewModel';
import { ErrorState } from '../../core/ui/StateViews';
import type { NotificationDetail } from './notificationModels';
import { planBackToInbox } from './notificationNavigation';
import type { NotificationDetailViewModel } from './NotificationDetailViewModel';

/** 알림 상세 화면(REQ-NOTI-023~027). 마운트마다 ViewModel을 새로 만들어 읽고, 읽음 처리는 하지 않는다. */
export function NotificationDetailScreen(): ReactNode {
  const { notificationId = '' } = useParams();
  const container = useContainer();
  const navigate = useNavigate();
  const location = useLocation();
  useScreenView('notification_detail');

  const backRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    backRef.current = () => {
      const plan = planBackToInbox(location);
      if (plan.kind === 'back') void navigate(-1);
      else void navigate(plan.to, { replace: true });
    };
  }, [location, navigate]);
  const goBack = useCallback(() => backRef.current(), []);

  const create = useCallback(() => {
    const created = container.createNotificationDetailViewModel({ notificationId });
    void created.load();
    return created;
  }, [container, notificationId]);
  const vm = useOwnedViewModel(create);
  return <DetailView vm={vm} onBack={goBack} />;
}

const barStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px' };
const textStyle: CSSProperties = { whiteSpace: 'pre-wrap', overflowWrap: 'break-word' };

function DetailView({ vm, onBack }: { vm: NotificationDetailViewModel | null; onBack: () => void }): ReactNode {
  return (
    <div data-testid="notification-detail.root">
      <header style={barStyle}>
        <button type="button" data-testid="notification-detail.back-button" aria-label={webOnlyCopy['noti.back']} onClick={onBack}>
          <span aria-hidden="true">←</span>
        </button>
        <h1 data-testid="notification-detail.screen-title" style={{ margin: 0, fontSize: 18 }}>
          {t('noti.detail.title')}
        </h1>
      </header>
      {vm ? <DetailBody vm={vm} onBack={onBack} /> : <Loading />}
    </div>
  );
}

function Loading(): ReactNode {
  return <div data-testid="notification-detail.loading" role="status" aria-busy="true" style={{ padding: 24 }} />;
}

function DetailBody({ vm, onBack }: { vm: NotificationDetailViewModel; onBack: () => void }): ReactNode {
  const { body } = useViewModel(vm);
  if (body.status === 'loading') return <Loading />;
  if (body.status === 'gone') {
    return (
      <p data-testid="notification-detail.not-found-state" style={{ padding: 16 }}>
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
    <article style={{ padding: '0 16px 24px' }}>
      <h2 data-testid="notification-detail.title" style={{ fontSize: 18, ...textStyle }}>
        {detail.title}
      </h2>
      <p data-testid="notification-detail.body" style={{ margin: '8px 0', ...textStyle }}>
        {detail.body}
      </p>
      {detail.type !== 'NOTICE' && detail.originalImageUrl ? (
        <img data-testid="notification-detail.photo" src={detail.originalImageUrl} alt={webOnlyCopy['noti.detail.photo-alt']} style={{ display: 'block', width: '100%', borderRadius: 8, background: '#e5e5e5' }} />
      ) : null}
      {rejected && detail.rejectionReason ? (
        <section data-testid="notification-detail.rejection-section" aria-labelledby={reasonId} style={{ marginTop: 16 }}>
          <h3 id={reasonId} style={{ fontSize: 14, margin: '0 0 4px' }}>
            {t('noti.detail.reason')}
          </h3>
          <p data-testid="notification-detail.rejection-reason" style={{ margin: 0, ...textStyle }}>
            {detail.rejectionReason}
          </p>
        </section>
      ) : null}
      {rejected ? (
        <button type="button" data-testid="notification-detail.back-to-inbox-button" style={{ marginTop: 16 }} onClick={onBackToInbox}>
          {t('noti.detail.to-inbox')}
        </button>
      ) : null}
    </article>
  );
}
