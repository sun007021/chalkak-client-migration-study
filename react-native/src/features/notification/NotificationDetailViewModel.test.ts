import { networkFailure } from '../../core/http/__testing__/FakeTransport';
import { t } from '../../shared/copy';
import {
  createNotificationHarness,
  detailKey,
  flush,
  deferredRoute,
  nid,
} from './__testing__/createNotificationHarness';
import { NotificationDetailViewModel } from './NotificationDetailViewModel';

async function setup(id: string, route: unknown) {
  const h = await createNotificationHarness({
    routes: { [detailKey(id)]: route as string },
  });
  const nav = { closeCount: 0, inboxCount: 0 };
  const viewModel = new NotificationDetailViewModel({
    notificationId: id,
    notifications: h.repository,
    events: h.events,
    home: () => h.home,
    toast: h.toast,
    authFlow: h.authFlow,
    analytics: h.analytics,
    navigator: {
      close: () => (nav.closeCount += 1),
      openInbox: () => (nav.inboxCount += 1),
    },
  });
  return { ...h, viewModel, nav };
}

const REJECTED = nid('02');
const NOTICE = nid('05');

describe('NotificationDetailViewModel', () => {
  it('TC-NOTI-042 반려 상세는 원본 사진·반려 사유·"알림함으로" 버튼을 보이고 읽음 PATCH는 보내지 않는다', async () => {
    const h = await setup(REJECTED, 'notification/notification-detail__rejected');
    await h.viewModel.onShown();
    const s = h.viewModel.getSnapshot();
    expect(s.status).toBe('content');
    expect(s.detail).toMatchObject({
      title: '사진이 반려되었어요',
      photoUrl: expect.stringContaining('original.webp'),
      rejectionReason: '다른 사람의 얼굴이 식별 가능하게 담겨 있어 전시할 수 없어요.',
      showBackToInbox: true,
    });
    expect(h.transport.requests.filter((r) => r.method === 'PATCH')).toHaveLength(0);
  });

  it('TC-NOTI-041 조회만으로는 읽음 호출이 0건이다', async () => {
    const h = await setup(REJECTED, 'notification/notification-detail__rejected');
    await h.viewModel.onShown();
    expect(h.transport.requests.map((r) => r.method)).toEqual(['GET']);
  });

  it('TC-NOTI-043 반려 사유 500자 전문을 그대로 담는다', async () => {
    const id = nid('07');
    const h = await setup(id, 'notification/notification-detail__rejected-long-reason');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().detail?.rejectionReason?.length).toBeGreaterThan(100);
  });

  it('TC-NOTI-044 공지 상세는 제목·본문 전문만(사진·사유·알림함 버튼 없음)', async () => {
    const h = await setup(NOTICE, 'notification/notification-detail__notice');
    await h.viewModel.onShown();
    const detail = h.viewModel.getSnapshot().detail;
    expect(detail?.body).toContain('점검 시간에는');
    expect(detail).toMatchObject({ photoUrl: null, rejectionReason: null, showBackToInbox: false });
  });

  it('TC-NOTI-047 승인 상세는 사진이 있으면 보이고 사유는 없다', async () => {
    const h = await setup(nid('01'), 'notification/notification-detail__approved');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().detail).toMatchObject({
      photoUrl: expect.stringContaining('original.webp'),
      rejectionReason: null,
    });
  });

  it('TC-NOTI-045 404는 not-found 상태(이전 정보 없음), gone 이벤트와 미읽음 재조회, noti.gone 토스트', async () => {
    const id = nid('99');
    const h = await setup(id, 'notification/notification-detail__not-found');
    const seen: string[] = [];
    h.events.subscribe((e) => seen.push(e.type));
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'not-found', detail: null });
    expect(h.toast.messages).toEqual([t('noti.gone')]);
    expect(seen).toEqual(['gone']);
    expect(h.home.unreadRefreshes).toBe(1);
  });

  it('TC-NOTI-046 500은 일반 오류, 네트워크 오류는 network 문구이고 retry가 재요청한다', async () => {
    const h = await setup(REJECTED, [
      'notification/notification-detail__internal-error',
      networkFailure(),
      'notification/notification-detail__rejected',
    ]);
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({
      status: 'error',
      errorMessage: t('noti.detail.error'),
    });
    await h.viewModel.retry();
    expect(h.viewModel.getSnapshot()).toMatchObject({
      status: 'error',
      errorMessage: t('noti.network'),
    });
    await h.viewModel.retry();
    expect(h.viewModel.getSnapshot().status).toBe('content');
  });

  it('REQ-NOTI-027 로딩 중 status는 loading', async () => {
    const gate = deferredRoute('notification/notification-detail__rejected');
    const h = await setup(REJECTED, gate.value);
    const run = h.viewModel.onShown();
    await flush();
    expect(h.viewModel.getSnapshot().status).toBe('loading');
    gate.release();
    await run;
  });

  it('TC-NOTI-048 화면이 보일 때 screen_view notification_detail을 1회 보낸다', async () => {
    const h = await setup(REJECTED, 'notification/notification-detail__rejected');
    await h.viewModel.onShown();
    expect(h.analytics.screenNames).toEqual(['notification_detail']);
  });

  it('401 UNAUTHORIZED가 남으면 로그인으로 보낸다', async () => {
    const h = await setup(REJECTED, 'notification/notifications__unauthorized');
    await h.viewModel.onShown();
    expect(h.authFlow.calls).toEqual(['login']);
  });

  it('REQ-NOTI-026 "알림함으로"는 알림함으로 이동하고 뒤로는 닫는다', async () => {
    const h = await setup(REJECTED, 'notification/notification-detail__rejected');
    await h.viewModel.onShown();
    h.viewModel.onBackToInboxPress();
    h.viewModel.onBackPress();
    expect(h.nav).toEqual({ closeCount: 1, inboxCount: 1 });
  });

  it('화면을 떠난 뒤(onHidden) 도착한 응답은 상태·토스트에 반영하지 않는다', async () => {
    const gate = deferredRoute('notification/notification-detail__not-found');
    const h = await setup(nid('99'), gate.value);
    const run = h.viewModel.onShown();
    await flush();
    h.viewModel.onHidden();
    gate.release();
    await run;
    expect(h.toast.messages).toEqual([]);
  });
});
