import { memo, useCallback, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { t } from '../../copy/ko';
import { webOnlyCopy } from '../../copy/webOnly';
import { useScreenView } from '../../core/analytics/useScreenView';
import { useViewModel } from '../../core/state/useViewModel';
import { notificationTimeLabel } from '../../core/time/format';
import { color, font, radius, space } from '../../design/tokens';
import { IcNotification, IcRotateRight } from '../../core/ui/icons.generated';
import { Skeleton } from '../../core/ui/Skeleton';
import { BackButton, TopBar } from '../../core/ui/TopBar';
import { EmptyState, ErrorState } from '../../core/ui/StateViews';
import { useScrollRestore } from '../../core/ui/useScrollRestore';
import { VisibilitySentinel } from '../../core/ui/VisibilitySentinel';
import type { NotificationItem } from './notificationModels';
import { planInboxClose, RouterNotificationNavigator } from './notificationNavigation';
import { useBackAction } from './useBackAction';
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

const listStyle: CSSProperties = { margin: 0, padding: 0, listStyle: 'none' };
const rowStyle: CSSProperties = { display: 'flex', gap: space.md, alignItems: 'flex-start', width: '100%', padding: `${space.lg} var(--space-screen-horizontal)`, border: 0, borderBottom: `1px solid ${color.border}`, background: 'none', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' };
const thumbStyle: CSSProperties = { flex: 'none', width: 56, height: 56, borderRadius: radius.small, objectFit: 'cover', background: color.calendarCell };
const textStyle: CSSProperties = { whiteSpace: 'pre-wrap', overflowWrap: 'break-word' };

function InboxView({ vm }: { vm: NotificationInboxViewModel }): ReactNode {
  const container = useContainer();
  const state = useViewModel(vm);
  const body = state.body;
  useScrollRestore(body.status !== 'loading');
  const close = useBackAction(planInboxClose);

  // 화면이 붙어 있는 동안 ViewModel이 초기화되면(계정 전환) 로딩에 머물지 않게 다시 읽는다. 이미 읽는 중이면 그 요청을 이어 쓴다.
  const loading = body.status === 'loading';
  useEffect(() => {
    if (loading) void vm.onShown();
  }, [loading, vm]);

  const canRefresh = (body.status === 'ready' || body.status === 'empty') && !state.refreshing;
  return (
    <div data-testid="notifications.root" className="ck-screen">
      <TopBar
        title={t('noti.inbox.title')}
        left={<BackButton testId="notifications.back-button" onClick={close} />}
        right={
          <button type="button" className="ck-icon-btn" aria-label={webOnlyCopy['noti.refresh']} disabled={!canRefresh} style={{ opacity: canRefresh ? 1 : 0.4 }} onClick={() => void vm.refresh()}>
            <IcRotateRight size={22} />
          </button>
        }
      />
      {state.refreshing ? (
        <div data-testid="notifications.refresh-indicator" role="status" aria-busy="true">
          <Skeleton style={{ height: 3 }} />
          <span className="visually-hidden">{webOnlyCopy['noti.refresh-indicator']}</span>
        </div>
      ) : null}
      {body.status === 'loading' ? (
        <div data-testid="notifications.loading" role="status" aria-busy="true" style={{ display: 'flex', flexDirection: 'column' }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: 'flex', gap: space.md, padding: `${space.lg} var(--space-screen-horizontal)` }}>
              <Skeleton style={{ flex: 'none', width: 56, height: 56, borderRadius: radius.small }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: space.sm }}>
                <Skeleton style={{ height: 16, width: '60%', borderRadius: radius.small }} />
                <Skeleton style={{ height: 14, width: '90%', borderRadius: radius.small }} />
              </div>
            </div>
          ))}
          <span className="visually-hidden">{t('noti.inbox.loading')}</span>
        </div>
      ) : null}
      {body.status === 'error' ? <ErrorState screenId="notifications" message={body.network ? t('noti.network') : t('noti.inbox.error')} onRetry={() => void vm.retry()} /> : null}
      {body.status === 'empty' ? (
        <EmptyState screenId="notifications" icon={<IcNotification size={34} />}>
          <p style={{ margin: 0, ...font('body'), color: color.textSecondary }}>{t('noti.inbox.empty.title')}</p>
          <p style={{ margin: 0, ...font('subheadline'), color: color.textMuted }}>{t('noti.inbox.empty.body')}</p>
        </EmptyState>
      ) : null}
      {body.status === 'ready' ? <InboxList vm={vm} state={state} items={body.items} hasNext={body.hasNext} observe={container.visibilityObserver} /> : null}
    </div>
  );
}

function InboxList({ vm, state, items, hasNext, observe }: { vm: NotificationInboxViewModel; state: InboxState; items: NotificationItem[]; hasNext: boolean; observe: ReturnType<typeof useContainer>['visibilityObserver'] }): ReactNode {
  // 다음 페이지 요청이 실패한 뒤에는 사용자가 다시 스크롤할 때까지 센티넬을 세우지 않는다(여전히 보이는 센티넬이 곧바로 재요청 반복을 일으키지 않게).
  const failures = state.pageFailures;
  // 상세에서 돌아와 다시 그려져도 죽은 채로 시작하지 않게 현재 실패 횟수로 시작한다.
  const [armedAt, setArmedAt] = useState(failures);
  useEffect(() => {
    if (armedAt === failures) return;
    const arm = () => setArmedAt(failures);
    window.addEventListener('scroll', arm, { once: true, passive: true });
    return () => window.removeEventListener('scroll', arm);
  }, [armedAt, failures]);
  const showSentinel = hasNext && !state.paging && armedAt === failures;
  const sentinelAt = Math.max(0, items.length - INBOX_SENTINEL_OFFSET);
  const onPress = useCallback((id: string) => void vm.onItemPress(id), [vm]);
  return (
    <>
      <ul data-testid="notifications.list" aria-label={t('noti.inbox.title')} style={listStyle}>
        {items.map((item, index) => (
          <li key={item.id}>
            {showSentinel && index === sentinelAt ? <VisibilitySentinel key={`${items.length}-${failures}`} observe={observe} onVisible={() => void vm.onSentinelVisible()} /> : null}
            <InboxRow item={item} onPress={onPress} />
          </li>
        ))}
      </ul>
      {state.paging ? (
        <div data-testid="notifications.load-more-indicator" role="status" aria-busy="true" style={{ padding: space.lg }}>
          <Skeleton style={{ height: 8, width: 96, margin: '0 auto', borderRadius: radius.pill }} />
          <span className="visually-hidden">{webOnlyCopy['noti.load-more']}</span>
        </div>
      ) : null}
    </>
  );
}

const InboxRow = memo(function InboxRow({ item, onPress }: { item: NotificationItem; onPress: (id: string) => void }): ReactNode {
  const id = item.id;
  return (
    <button type="button" data-testid={`notifications.item-${id}`} style={rowStyle} onClick={() => onPress(id)}>
      {item.thumbnailImageUrl ? (
        <img data-testid={`notifications.item-thumbnail-${id}`} src={item.thumbnailImageUrl} alt="" style={thumbStyle} />
      ) : (
        <span data-testid={`notifications.item-thumbnail-${id}`} aria-hidden="true" style={thumbStyle} />
      )}
      <span style={{ flex: 1, minWidth: 0, display: 'block' }}>
        <strong data-testid={`notifications.item-title-${id}`} style={{ display: 'block', ...font('subheadline'), fontWeight: 600, ...textStyle }}>
          {item.title}
        </strong>
        <span data-testid={`notifications.item-body-${id}`} style={{ display: 'block', marginTop: 2, color: color.textSecondary, ...font('footnote'), ...textStyle }}>
          {item.body}
        </span>
        <time data-testid={`notifications.item-time-${id}`} dateTime={new Date(item.createdAt).toISOString()} style={{ display: 'block', marginTop: space.xs, color: color.textMuted, ...font('caption') }}>
          {notificationTimeLabel(item.createdAt)}
        </time>
      </span>
      {item.readAt === null ? (
        <span data-testid={`notifications.item-unread-${id}`} role="img" aria-label={webOnlyCopy['noti.unread.a11y']} style={{ flex: 'none', width: 7, height: 7, borderRadius: '50%', background: color.inputCursor, marginTop: 6 }} />
      ) : null}
    </button>
  );
});
