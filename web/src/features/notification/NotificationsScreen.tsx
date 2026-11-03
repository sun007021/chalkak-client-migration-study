import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { t } from '../../copy/ko';
import { webOnlyCopy } from '../../copy/webOnly';
import { useScreenView } from '../../core/analytics/useScreenView';
import { useViewModel } from '../../core/state/useViewModel';
import { notificationTimeLabel } from '../../core/time/format';
import { EmptyState, ErrorState } from '../../core/ui/StateViews';
import { useScrollRestore } from '../../core/ui/useScrollRestore';
import { VisibilitySentinel } from '../home/HomeScreen';
import type { NotificationItem } from './notificationModels';
import { planInboxClose, RouterNotificationNavigator } from './notificationNavigation';
import { INBOX_SENTINEL_OFFSET } from './NotificationInboxViewModel';
import type { InboxState, NotificationInboxViewModel } from './NotificationInboxViewModel';

/**
 * 알림함 화면. 로직은 NotificationInboxViewModel에 있고 여기서는 그리기만 한다.
 * ViewModel은 컨테이너가 하나를 보관하므로(inboxSession) 화면은 붙고 떨어질 뿐이다: 붙으면 이동 수단을 꽂고 onShown,
 * 문서가 가려지거나 화면이 떨어지면 onHidden. 당겨서 새로고침 대신 "새로고침" 버튼을 둔다.
 */
export function NotificationsScreen(): ReactNode {
  const container = useContainer();
  const navigate = useNavigate();
  useScreenView('notifications');
  const { viewModel: vm, navigator } = container.inboxSession();

  useEffect(() => {
    const detach = navigator.attach(new RouterNotificationNavigator((to, options) => navigate(to, options)));
    void vm.onShown();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') vm.onHidden();
      else void vm.onShown();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      vm.onHidden();
      detach();
    };
  }, [vm, navigator, navigate]);

  return <InboxView vm={vm} />;
}

const barStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 16px' };
const titleStyle: CSSProperties = { margin: 0, fontSize: 18, flex: 1 };
const listStyle: CSSProperties = { margin: 0, padding: 0, listStyle: 'none' };
const rowStyle: CSSProperties = { display: 'flex', gap: 12, alignItems: 'flex-start', width: '100%', padding: '12px 16px', border: 0, background: 'none', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' };
const thumbStyle: CSSProperties = { flex: 'none', width: 56, height: 56, borderRadius: 8, objectFit: 'cover', background: '#e5e5e5' };
const textStyle: CSSProperties = { whiteSpace: 'pre-wrap', overflowWrap: 'break-word' };

function InboxView({ vm }: { vm: NotificationInboxViewModel }): ReactNode {
  const container = useContainer();
  const navigate = useNavigate();
  const location = useLocation();
  const state = useViewModel(vm);
  const body = state.body;
  useScrollRestore(body.status !== 'loading');

  const closeRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    closeRef.current = () => {
      const plan = planInboxClose(location);
      if (plan.kind === 'back') void navigate(-1);
      else void navigate(plan.to, { replace: true });
    };
  }, [location, navigate]);

  const canRefresh = (body.status === 'ready' || body.status === 'empty') && !state.refreshing;
  return (
    <div data-testid="notifications.root">
      <header style={barStyle}>
        <button type="button" data-testid="notifications.back-button" aria-label={webOnlyCopy['noti.back']} onClick={() => closeRef.current()}>
          <span aria-hidden="true">←</span>
        </button>
        <h1 style={titleStyle}>{t('noti.inbox.title')}</h1>
        <button type="button" aria-label={webOnlyCopy['noti.refresh']} disabled={!canRefresh} onClick={() => void vm.refresh()}>
          <span aria-hidden="true">↻</span>
        </button>
      </header>
      {state.refreshing ? (
        <div data-testid="notifications.refresh-indicator" role="status" aria-busy="true" style={{ padding: '4px 16px', fontSize: 12, background: '#f2f2f2' }}>
          {webOnlyCopy['noti.refresh-indicator']}
        </div>
      ) : null}
      {body.status === 'loading' ? (
        <div data-testid="notifications.loading" role="status" aria-busy="true" style={{ padding: 24, textAlign: 'center' }}>
          {t('noti.inbox.loading')}
        </div>
      ) : null}
      {body.status === 'error' ? <ErrorState screenId="notifications" message={body.network ? t('noti.network') : t('noti.inbox.error')} onRetry={() => void vm.retry()} /> : null}
      {body.status === 'empty' ? (
        <EmptyState screenId="notifications">
          <p style={{ margin: 0, padding: '24px 16px 0', fontWeight: 600 }}>{t('noti.inbox.empty.title')}</p>
          <p style={{ margin: 0, padding: '4px 16px' }}>{t('noti.inbox.empty.body')}</p>
        </EmptyState>
      ) : null}
      {body.status === 'ready' ? <InboxList vm={vm} state={state} items={body.items} hasNext={body.hasNext} observe={container.visibilityObserver} /> : null}
    </div>
  );
}

function InboxList({ vm, state, items, hasNext, observe }: { vm: NotificationInboxViewModel; state: InboxState; items: NotificationItem[]; hasNext: boolean; observe: ReturnType<typeof useContainer>['visibilityObserver'] }): ReactNode {
  // 다음 페이지 요청이 실패한 뒤에는 사용자가 다시 스크롤할 때까지 센티넬을 세우지 않는다(여전히 보이는 센티넬이 곧바로 재요청 반복을 일으키지 않게).
  const [armedAt, setArmedAt] = useState(0);
  const failures = state.pageFailures;
  useEffect(() => {
    if (armedAt === failures) return;
    const arm = () => setArmedAt(failures);
    window.addEventListener('scroll', arm, { once: true, passive: true });
    return () => window.removeEventListener('scroll', arm);
  }, [armedAt, failures]);
  const showSentinel = hasNext && !state.paging && armedAt === failures;
  const sentinelAt = Math.max(0, items.length - INBOX_SENTINEL_OFFSET);
  return (
    <>
      <ul data-testid="notifications.list" aria-label={t('noti.inbox.title')} style={listStyle}>
        {items.map((item, index) => (
          <li key={item.id}>
            {showSentinel && index === sentinelAt ? <VisibilitySentinel key={`${items.length}-${failures}`} observe={observe} onVisible={() => void vm.onSentinelVisible()} /> : null}
            <InboxRow item={item} onPress={() => void vm.onItemPress(item.id)} />
          </li>
        ))}
      </ul>
      {state.paging ? (
        <p data-testid="notifications.load-more-indicator" role="status" aria-busy="true" style={{ textAlign: 'center' }}>
          {webOnlyCopy['noti.load-more']}
        </p>
      ) : null}
    </>
  );
}

function InboxRow({ item, onPress }: { item: NotificationItem; onPress: () => void }): ReactNode {
  const id = item.id;
  return (
    <button type="button" data-testid={`notifications.item-${id}`} style={rowStyle} onClick={onPress}>
      {item.thumbnailImageUrl ? (
        <img data-testid={`notifications.item-thumbnail-${id}`} src={item.thumbnailImageUrl} alt="" style={thumbStyle} />
      ) : (
        <span data-testid={`notifications.item-thumbnail-${id}`} aria-hidden="true" style={thumbStyle} />
      )}
      <span style={{ flex: 1, minWidth: 0, display: 'block' }}>
        <strong data-testid={`notifications.item-title-${id}`} style={{ display: 'block', ...textStyle }}>
          {item.title}
        </strong>
        <span data-testid={`notifications.item-body-${id}`} style={{ display: 'block', ...textStyle }}>
          {item.body}
        </span>
        <small data-testid={`notifications.item-time-${id}`} style={{ display: 'block', opacity: 0.7 }}>
          {notificationTimeLabel(item.createdAt)}
        </small>
      </span>
      {item.readAt === null ? (
        <span data-testid={`notifications.item-unread-${id}`} role="img" aria-label={webOnlyCopy['noti.unread.a11y']} style={{ flex: 'none', width: 8, height: 8, borderRadius: 4, background: '#e53935', marginTop: 6 }} />
      ) : null}
    </button>
  );
}
