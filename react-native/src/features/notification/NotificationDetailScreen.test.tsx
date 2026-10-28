import { fireEvent, render, screen } from '@testing-library/react-native';

import { t } from '../../shared/copy';
import { createNotificationHarness, detailKey, nid } from './__testing__/createNotificationHarness';
import { NotificationDetailScreen } from './NotificationDetailScreen';
import { NotificationDetailViewModel } from './NotificationDetailViewModel';

async function renderDetail(id: string, route: string) {
  const h = await createNotificationHarness({ routes: { [detailKey(id)]: route } });
  const nav = { closeCount: 0, inboxCount: 0 };
  const viewModel = new NotificationDetailViewModel({
    notificationId: id,
    notifications: h.repository,
    events: h.events,
    home: () => h.home,
    toast: h.toast,
    authFlow: h.authFlow,
    analytics: h.analytics,
    navigator: { close: () => (nav.closeCount += 1), openInbox: () => (nav.inboxCount += 1) },
  });
  await render(<NotificationDetailScreen viewModel={viewModel} />);
  return { ...h, nav };
}

describe('NotificationDetailScreen', () => {
  it('TC-NOTI-042 반려 상세: 제목 바, 알림 제목·본문, 원본 사진, 반려 사유, 알림함으로 버튼(새로 올리기 없음)', async () => {
    const h = await renderDetail(nid('02'), 'notification/notification-detail__rejected');
    await screen.findByTestId('notification-detail.title');
    expect(screen.getByTestId('notification-detail.screen-title')).toHaveTextContent(
      t('noti.detail.title'),
    );
    expect(screen.getByTestId('notification-detail.photo')).toBeOnTheScreen();
    expect(screen.getByTestId('notification-detail.rejection-section')).toBeOnTheScreen();
    expect(screen.getByText(t('noti.detail.reason'))).toBeOnTheScreen();
    expect(screen.getByTestId('notification-detail.rejection-reason')).toHaveTextContent(
      '다른 사람의 얼굴이 식별 가능하게 담겨 있어 전시할 수 없어요.',
    );
    expect(screen.queryByText(t('noti.detail.reupload'))).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('notification-detail.back-to-inbox-button'));
    expect(h.nav.inboxCount).toBe(1);
    await fireEvent.press(screen.getByTestId('notification-detail.back-button'));
    expect(h.nav.closeCount).toBe(1);
  });

  it('TC-NOTI-044 공지 상세: 사진·반려 사유·알림함으로 버튼이 트리에 없다', async () => {
    await renderDetail(nid('05'), 'notification/notification-detail__notice');
    await screen.findByTestId('notification-detail.body');
    expect(screen.queryByTestId('notification-detail.photo')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('notification-detail.rejection-section')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('notification-detail.back-to-inbox-button')).not.toBeOnTheScreen();
  });

  it('TC-NOTI-045 404면 찾을 수 없음 상태를 보인다', async () => {
    await renderDetail(nid('99'), 'notification/notification-detail__not-found');
    expect(await screen.findByTestId('notification-detail.not-found-state')).toBeOnTheScreen();
    expect(screen.getByText(t('noti.gone'))).toBeOnTheScreen();
  });

  it('TC-NOTI-046 오류 상태에서 다시 시도가 재요청한다', async () => {
    const h = await createNotificationHarness({
      routes: {
        [detailKey(nid('02'))]: [
          'notification/notification-detail__internal-error',
          'notification/notification-detail__internal-error',
          'notification/notification-detail__internal-error',
          'notification/notification-detail__rejected',
        ] as never,
      },
    });
    const viewModel = new NotificationDetailViewModel({
      notificationId: nid('02'),
      notifications: h.repository,
      events: h.events,
      home: () => h.home,
      toast: h.toast,
      authFlow: h.authFlow,
      analytics: h.analytics,
      navigator: { close: () => undefined, openInbox: () => undefined },
    });
    await render(<NotificationDetailScreen viewModel={viewModel} />);
    expect(await screen.findByTestId('notification-detail.error-state')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('notification-detail.retry-button'));
    expect(await screen.findByTestId('notification-detail.title')).toBeOnTheScreen();
  });
});
