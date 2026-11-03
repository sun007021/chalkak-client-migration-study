import { vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { t } from '../../copy/ko';
import { webOnlyCopy } from '../../copy/webOnly';
import { deferred } from '../../test/deferred';
import { gated } from '../../test/displayAsserts';
import { json } from '../../test/fixtureRouter';
import { loadFixture } from '../../test/fixtures';
import { detailKey, noti } from '../../test/notificationHarness';
import { openNotifications, toastText } from '../../test/notificationScreens';
import { screenViews } from '../../test/screenViews';

vi.setConfig({ testTimeout: 15_000 });

const tid = (id: string) => screen.getByTestId(id);
const GONE_ID = '33333333-3333-4333-8333-333333333399';
const path = (n: number | string) => `/notifications/${typeof n === 'number' ? noti(n) : n}`;
const failing = () => {
  throw new TypeError('Failed to fetch');
};
const detailBody = (fixture: string, change: (body: Record<string, unknown>) => void = () => undefined) => () => {
  const body = structuredClone(loadFixture(`${fixture}.json`).json) as Record<string, unknown>;
  change(body);
  return json(200, body);
};
const whiteSpace = (el: HTMLElement) => getComputedStyle(el).whiteSpace;

describe('반려 알림 상세 (TC-NOTI-042, 043, REQ-NOTI-024, 026)', () => {
  it('TC-NOTI-042 제목 바 "알림 상세", 알림 제목·본문, 원본 사진, "반려 사유" 섹션과 사유, "알림함으로" 버튼이 보인다', async () => {
    await openNotifications({ path: path(2) });
    await screen.findByTestId('notification-detail.title');
    for (const id of ['notification-detail.root', 'notification-detail.screen-title', 'notification-detail.back-button', 'notification-detail.title', 'notification-detail.body', 'notification-detail.photo', 'notification-detail.rejection-section', 'notification-detail.rejection-reason', 'notification-detail.back-to-inbox-button']) {
      expect(tid(id), id).toBeInTheDocument();
    }
    expect(tid('notification-detail.screen-title')).toHaveTextContent(t('noti.detail.title'));
    expect(tid('notification-detail.title')).toHaveTextContent('사진이 반려되었어요');
    expect(tid('notification-detail.body')).toHaveTextContent('자세한 사유를 확인해 주세요.');
    expect(tid('notification-detail.rejection-section')).toHaveTextContent(t('noti.detail.reason'));
    expect(tid('notification-detail.rejection-reason')).toHaveTextContent('다른 사람의 얼굴이 식별 가능하게 담겨 있어 전시할 수 없어요.');
    expect(tid('notification-detail.back-to-inbox-button')).toHaveTextContent(t('noti.detail.to-inbox'));
    const photo = tid('notification-detail.photo');
    expect(photo.tagName === 'IMG' ? photo : within(photo).getByRole('img')).toHaveAttribute('src', expect.stringContaining('/original.webp'));
  });

  it('TC-NOTI-042 "새로 올리기" 버튼은 어디에도 없다', async () => {
    await openNotifications({ path: path(2) });
    await screen.findByTestId('notification-detail.title');
    expect(screen.queryByText(t('noti.detail.reupload'))).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('noti.detail.reupload') })).not.toBeInTheDocument();
  });

  it('a11y: 제목 바는 level 1, 알림 제목은 level 2 제목이고 반려 사유는 이름 있는 region이며 사진에 대체 텍스트가 있다', async () => {
    await openNotifications({ path: path(2) });
    await screen.findByTestId('notification-detail.title');
    expect(screen.getByRole('heading', { level: 1, name: t('noti.detail.title') })).toBe(tid('notification-detail.screen-title'));
    expect(screen.getByRole('heading', { level: 2, name: '사진이 반려되었어요' })).toBe(tid('notification-detail.title'));
    expect(screen.getByRole('region', { name: t('noti.detail.reason') })).toBe(tid('notification-detail.rejection-section'));
    expect(screen.getByRole('img', { name: webOnlyCopy['noti.detail.photo-alt'] })).toBeInTheDocument();
    expect(tid('notification-detail.back-button')).toHaveAccessibleName(webOnlyCopy['noti.back']);
    expect(tid('notification-detail.back-to-inbox-button').tagName).toBe('BUTTON');
  });

  it('TC-NOTI-043 반려 사유 500자 전문이 잘리지 않고 줄바꿈이 보존되는 서식으로 보인다', async () => {
    await openNotifications({ path: path(7), routes: { [detailKey(7)]: 'notification/notification-detail__rejected-long-reason' } });
    await screen.findByTestId('notification-detail.rejection-reason');
    const reason = tid('notification-detail.rejection-reason');
    expect(reason.textContent).toHaveLength(500);
    expect(['pre-wrap', 'pre-line']).toContain(whiteSpace(reason));
    expect(getComputedStyle(reason).overflowWrap).toMatch(/break-word|anywhere/);
  });

  it('REQ-NOTI-024 사진·사유가 null인 반려 알림은 해당 영역만 숨기고 제목·본문·"알림함으로"는 남는다', async () => {
    await openNotifications({
      path: path(2),
      routes: {
        [detailKey(2)]: detailBody('notification/notification-detail__rejected', (body) => {
          body['originalImageUrl'] = null;
          body['rejectionReason'] = null;
        }),
      },
    });
    await screen.findByTestId('notification-detail.title');
    expect(screen.queryByTestId('notification-detail.photo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('notification-detail.rejection-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('notification-detail.rejection-reason')).not.toBeInTheDocument();
    expect(tid('notification-detail.body')).toBeInTheDocument();
    expect(tid('notification-detail.back-to-inbox-button')).toBeInTheDocument();
  });

  it('REQ-NOTI-026 딥링크로 열린 반려 상세의 "알림함으로"는 알림함으로 replace 이동한다', async () => {
    const { router } = await openNotifications({ path: path(2) });
    await screen.findByTestId('notification-detail.back-to-inbox-button');
    fireEvent.click(tid('notification-detail.back-to-inbox-button'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/notifications'));
    expect(router.state.historyAction).toBe('REPLACE');
    await screen.findByTestId('notifications.list');
  });
});

describe('공지·승인 알림 상세 (TC-NOTI-044, 047, REQ-NOTI-025)', () => {
  it('TC-NOTI-044 공지는 제목·본문 전문(줄바꿈 보존)만 보이고 사진·반려 사유·"알림함으로"는 없다', async () => {
    await openNotifications({ path: path(5) });
    await screen.findByTestId('notification-detail.title');
    expect(tid('notification-detail.title')).toHaveTextContent('서비스 점검 안내');
    const body = tid('notification-detail.body');
    expect(body.textContent).toBe('10월 30일 새벽 2시부터 4시까지 서비스 점검이 진행됩니다.\n점검 시간에는 사진 업로드와 피드 조회가 제한될 수 있어요.\n이용에 불편을 드려 죄송합니다.');
    expect(['pre-wrap', 'pre-line']).toContain(whiteSpace(body));
    for (const id of ['notification-detail.photo', 'notification-detail.rejection-section', 'notification-detail.rejection-reason', 'notification-detail.back-to-inbox-button']) {
      expect(screen.queryByTestId(id), id).not.toBeInTheDocument();
    }
  });

  it('REQ-NOTI-025 공지는 서버가 사진·사유를 실수로 채워 보내도 그 영역을 그리지 않는다(임시 결정)', async () => {
    await openNotifications({
      path: path(5),
      routes: {
        [detailKey(5)]: detailBody('notification/notification-detail__notice', (body) => {
          body['originalImageUrl'] = 'https://cdn.example.test/x/original.webp';
          body['rejectionReason'] = '사유';
        }),
      },
    });
    await screen.findByTestId('notification-detail.title');
    expect(screen.queryByTestId('notification-detail.photo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('notification-detail.rejection-section')).not.toBeInTheDocument();
  });

  it('TC-NOTI-047 승인 알림은 사진이 있으면 표시하고 반려 사유 섹션과 "알림함으로"는 없다', async () => {
    await openNotifications({ path: path(1) });
    await screen.findByTestId('notification-detail.title');
    expect(tid('notification-detail.photo')).toBeInTheDocument();
    expect(tid('notification-detail.title')).toHaveTextContent('사진이 승인되었어요');
    expect(screen.queryByTestId('notification-detail.rejection-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('notification-detail.back-to-inbox-button')).not.toBeInTheDocument();
  });

  it('TC-NOTI-047 승인 알림에 사진이 없으면 제목·본문만 보이고 깨지지 않는다', async () => {
    await openNotifications({
      path: path(1),
      routes: { [detailKey(1)]: detailBody('notification/notification-detail__approved', (body) => (body['originalImageUrl'] = null)) },
    });
    await screen.findByTestId('notification-detail.title');
    expect(screen.queryByTestId('notification-detail.photo')).not.toBeInTheDocument();
    expect(tid('notification-detail.body')).toBeInTheDocument();
  });

  it('승인 알림에 반려 사유 필드가 와도 반려 사유 섹션은 반려 알림에서만 그린다(임시 결정)', async () => {
    await openNotifications({
      path: path(1),
      routes: { [detailKey(1)]: detailBody('notification/notification-detail__approved', (body) => (body['rejectionReason'] = '사유')) },
    });
    await screen.findByTestId('notification-detail.title');
    expect(screen.queryByTestId('notification-detail.rejection-section')).not.toBeInTheDocument();
  });
});

describe('알림 상세 상태 (TC-NOTI-041, 045, 046, 048, REQ-NOTI-027)', () => {
  it('로딩 중에는 로딩 표시만 있고 알림 정보와 "알림함으로"는 없다', async () => {
    const gate = deferred<void>();
    await openNotifications({ path: path(2), routes: { [detailKey(2)]: gated(gate, 'notification/notification-detail__rejected') }, waitFor: 'notification-detail.loading' });
    expect(tid('notification-detail.loading')).toHaveAttribute('role', 'status');
    expect(screen.queryByTestId('notification-detail.title')).not.toBeInTheDocument();
    expect(screen.queryByTestId('notification-detail.back-to-inbox-button')).not.toBeInTheDocument();
    expect(tid('notification-detail.back-button')).toBeInTheDocument();
    await act(async () => gate.resolve());
    await screen.findByTestId('notification-detail.title');
    expect(screen.queryByTestId('notification-detail.loading')).not.toBeInTheDocument();
  });

  it('TC-NOTI-041 상세를 열어도 읽음 PATCH는 0건이다(읽음은 이동 전 단계에서 처리)', async () => {
    const { h } = await openNotifications({ path: path(2) });
    await screen.findByTestId('notification-detail.title');
    expect(h.ff.calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
  });

  it('TC-NOTI-045 404면 "더 이상 확인할 수 없는 알림이에요."만 보이고 이전 알림 정보는 보이지 않으며 알림함을 새로고침한다', async () => {
    await openNotifications({ path: path(GONE_ID), routes: { [detailKey(GONE_ID)]: 'notification/notification-detail__not-found' }, waitFor: 'notification-detail.not-found-state' });
    expect(tid('notification-detail.not-found-state')).toHaveTextContent(t('noti.gone'));
    for (const id of ['notification-detail.title', 'notification-detail.body', 'notification-detail.photo', 'notification-detail.back-to-inbox-button', 'notification-detail.error-state']) {
      expect(screen.queryByTestId(id), id).not.toBeInTheDocument();
    }
    expect(tid('notification-detail.back-button')).toBeInTheDocument();
    expect(toastText()).toBeNull();
  });

  it('TC-NOTI-046 500이면 "알림을 불러오지 못했어요"와 "다시 시도"가 보이고 누르면 다시 요청해 상세가 나온다', async () => {
    const { h, fixtures } = await openNotifications({ path: path(2), routes: { [detailKey(2)]: 'notification/notification-detail__internal-error' }, waitFor: null });
    // 5xx는 0.5초·1초 간격으로 재시도한다(D-21). 요청이 대기를 시작할 때까지 시계를 계속 민다.
    await waitFor(async () => {
      await act(async () => {
        await h.clock.advance(1_500);
      });
      expect(screen.getByTestId('notification-detail.error-state')).toBeInTheDocument();
    });
    expect(tid('notification-detail.error-state')).toHaveTextContent(t('noti.detail.error'));
    expect(tid('notification-detail.retry-button')).toHaveTextContent(t('noti.inbox.retry'));
    fixtures.set(detailKey(2), 'notification/notification-detail__rejected');
    fireEvent.click(tid('notification-detail.retry-button'));
    await screen.findByTestId('notification-detail.title');
    expect(fixtures.calls(detailKey(2))).toHaveLength(1);
    expect(screen.queryByTestId('notification-detail.error-state')).not.toBeInTheDocument();
  });

  it('TC-NOTI-046 연결 실패면 "네트워크 연결을 확인해 주세요."를 보인다', async () => {
    const { h } = await openNotifications({ path: path(2), routes: { [detailKey(2)]: failing }, waitFor: null });
    // 연결 실패도 재시도한 뒤 오류가 된다(D-21). 요청이 대기를 시작할 때까지 시계를 계속 민다.
    await waitFor(async () => {
      await act(async () => {
        await h.clock.advance(1_500);
      });
      expect(screen.getByTestId('notification-detail.error-state')).toBeInTheDocument();
    });
    expect(tid('notification-detail.error-state')).toHaveTextContent(t('noti.network'));
  });

  it('TC-NOTI-048 알림 상세가 보이면 screen_view "notification_detail"이 한 번 기록된다', async () => {
    const { h } = await openNotifications({ path: path(2) });
    await screen.findByTestId('notification-detail.title');
    expect(screenViews(h.tracker)).toEqual(['notification_detail']);
  });

  it('상세의 뒤로 버튼은 새로고침·딥링크로 첫 항목이면 알림함으로 replace한다', async () => {
    const { router } = await openNotifications({ path: path(5) });
    await screen.findByTestId('notification-detail.title');
    fireEvent.click(tid('notification-detail.back-button'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/notifications'));
    expect(router.state.historyAction).toBe('REPLACE');
  });
});
