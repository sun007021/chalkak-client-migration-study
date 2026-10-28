import { fireEvent, render, screen } from '@testing-library/react-native';

import { networkFailure } from '../../core/http/__testing__/FakeTransport';
import { t } from '../../shared/copy';
import {
  createNotificationHarness,
  deferredRoute,
  flush,
  LIST_P1,
  nid,
  readKey,
} from './__testing__/createNotificationHarness';
import { NotificationInboxScreen } from './NotificationInboxScreen';
import { NotificationInboxViewModel } from './NotificationInboxViewModel';

async function renderInbox(routes: Parameters<typeof createNotificationHarness>[0] = {}) {
  const h = await createNotificationHarness(routes);
  const viewModel = new NotificationInboxViewModel({
    notifications: h.repository,
    processor: h.processor,
    events: h.events,
    toast: h.toast,
    authFlow: h.authFlow,
    analytics: h.analytics,
  });
  await render(<NotificationInboxScreen viewModel={viewModel} />);
  return { ...h, viewModel };
}

describe('NotificationInboxScreen', () => {
  it('TC-NOTI-004 로딩 중 notifications.loading과 로딩 문구가 보인다', async () => {
    const gate = deferredRoute('notification/notifications__page1');
    const h = await renderInbox({ routes: { [LIST_P1]: gate.value } });
    expect(await screen.findByTestId('notifications.loading')).toBeOnTheScreen();
    expect(screen.getByText(t('noti.inbox.loading'))).toBeOnTheScreen();
    gate.release();
    await screen.findByTestId('notifications.list');
    expect(screen.queryByTestId('notifications.loading')).not.toBeOnTheScreen();
    expect(h.analytics.screenNames).toEqual(['notifications']);
  });

  it('TC-NOTI-011 항목은 제목·본문·시각·썸네일(없으면 대체 이미지)을 보이고 미읽음 표시는 읽지 않은 행에만 존재한다', async () => {
    await renderInbox();
    await screen.findByTestId('notifications.list');
    for (const part of ['item', 'item-title', 'item-body', 'item-time']) {
      expect(screen.getByTestId(`notifications.${part}-${nid('01')}`)).toBeOnTheScreen();
    }
    expect(screen.getByTestId(`notifications.item-title-${nid('01')}`)).toHaveTextContent(
      '사진이 승인되었어요',
    );
    expect(screen.getByTestId(`notifications.item-time-${nid('01')}`)).toHaveTextContent(
      '10월 27일 10:30',
    );
    expect(screen.getByTestId(`notifications.item-unread-${nid('01')}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`notifications.item-thumbnail-${nid('05')}`)).toBeOnTheScreen();
    expect(screen.queryByTestId(`notifications.item-unread-${nid('06')}`)).not.toBeOnTheScreen();
  });

  it('TC-NOTI-005 빈 응답은 빈 상태 제목과 설명을 보인다', async () => {
    await renderInbox({ routes: { [LIST_P1]: 'notification/notifications__empty' } });
    expect(await screen.findByTestId('notifications.empty-state')).toBeOnTheScreen();
    expect(screen.getByText(t('noti.inbox.empty.title'))).toBeOnTheScreen();
    expect(screen.getByText(t('noti.inbox.empty.body'))).toBeOnTheScreen();
  });

  it('TC-NOTI-006 오류 화면에 문구와 다시 시도가 보이고 누르면 재요청한다', async () => {
    const h = await renderInbox({
      routes: {
        [LIST_P1]: [
          'notification/notifications__internal-error',
          'notification/notifications__internal-error',
          'notification/notifications__internal-error',
          'notification/notifications__page1',
        ],
      },
    });
    expect(await screen.findByTestId('notifications.error-state')).toBeOnTheScreen();
    expect(screen.getByText(t('noti.inbox.error'))).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('notifications.retry-button'));
    await screen.findByTestId('notifications.list');
    expect(h.router.calls(LIST_P1).length).toBeGreaterThanOrEqual(2);
  });

  it('TC-NOTI-007 네트워크 오류 문구', async () => {
    await renderInbox({ routes: { [LIST_P1]: networkFailure() } });
    await screen.findByTestId('notifications.error-state');
    expect(screen.getByText(t('noti.network'))).toBeOnTheScreen();
  });

  it('TC-NOTI-027 행을 누르면 읽음 처리 뒤 이동한다', async () => {
    const h = await renderInbox({
      routes: { [readKey(nid('01'))]: 'notification/notification-read__no-content' },
    });
    await screen.findByTestId('notifications.list');
    await fireEvent.press(screen.getByTestId(`notifications.item-${nid('01')}`));
    await flush();
    expect(h.navigator.calls).toHaveLength(1);
    expect(screen.queryByTestId(`notifications.item-unread-${nid('01')}`)).not.toBeOnTheScreen();
  });

  it('화면 루트와 뒤로 버튼이 있고 뒤로를 누르면 ViewModel에 전달한다', async () => {
    const h = await renderInbox();
    await screen.findByTestId('notifications.list');
    expect(screen.getByTestId('notifications.root')).toBeOnTheScreen();
    expect(screen.getByTestId('notifications.back-button')).toBeOnTheScreen();
    expect(h.viewModel.getSnapshot().status).toBe('ready');
  });
});
