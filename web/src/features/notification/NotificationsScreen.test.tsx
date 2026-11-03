import { vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { t } from '../../copy/ko';
import { webOnlyCopy } from '../../copy/webOnly';
import { deferred } from '../../test/deferred';
import { gated } from '../../test/displayAsserts';
import { FakeVisibilityObserver } from '../../test/FakeVisibilityObserver';
import { json } from '../../test/fixtureRouter';
import { loadFixture } from '../../test/fixtures';
import { noti, PAGE1, PAGE2, readKey, SOURCE_POST } from '../../test/notificationHarness';
import { createNotificationServer, inboxLoaded, openNotifications, toastText } from '../../test/notificationScreens';
import { screenViews } from '../../test/screenViews';
import { readOpenAiReview } from '../aireview/aiEntry';

vi.setConfig({ testTimeout: 15_000 }); // 구현 전에는 findBy가 5초 뒤 단언 오류로 끝나게 한다(테스트 시간 초과로 가려지지 않게)

const tid = (id: string) => screen.getByTestId(id);
const item = (n: number) => tid(`notifications.item-${noti(n)}`);
const itemIds = () => screen.getAllByTestId(/^notifications\.item-3333/).map((el) => el.getAttribute('data-testid')!.slice('notifications.item-'.length).slice(-2));
const failing = () => {
  throw new TypeError('Failed to fetch');
};
const page1 = () => structuredClone(loadFixture('notification/notifications__page1.json').json) as { notifications: Record<string, unknown>[] };

describe('알림함 화면 구성 (TC-NOTI-011, REQ-NOTI-003, 004)', () => {
  it('TC-NOTI-011 요소가 존재하고 행마다 제목·본문·시각·썸네일이 서버가 준 값 그대로 보인다', async () => {
    await openNotifications();
    await inboxLoaded();
    for (const id of ['notifications.root', 'notifications.back-button', 'notifications.list']) expect(tid(id), id).toBeInTheDocument();
    expect(itemIds()).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0')));
    const first = noti(1);
    expect(tid(`notifications.item-title-${first}`)).toHaveTextContent('사진이 승인되었어요');
    expect(tid(`notifications.item-body-${first}`)).toHaveTextContent('오늘의 사진이 전시에 올라갔어요.');
    expect(tid(`notifications.item-time-${first}`)).toHaveTextContent('10월 27일 10:30'); // 2026-10-27T01:30Z = KST 10:30
    const thumb = tid(`notifications.item-thumbnail-${first}`);
    expect(thumb.tagName === 'IMG' ? thumb : within(thumb).getByRole('img', { hidden: true })).toHaveAttribute('src', expect.stringContaining('/thumbnail.webp'));
    expect(screen.queryByTestId('notifications.loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('notifications.empty-state')).not.toBeInTheDocument();
    expect(screen.queryByTestId('notifications.error-state')).not.toBeInTheDocument();
  });

  it('TC-NOTI-011 썸네일이 null이면 이미지 없이 대체 표시만 있다', async () => {
    await openNotifications();
    await inboxLoaded();
    const notice = tid(`notifications.item-thumbnail-${noti(5)}`);
    expect(notice).toBeInTheDocument();
    expect(notice.tagName).not.toBe('IMG');
    expect(notice.querySelector('img')).toBeNull();
  });

  it('TC-NOTI-011 미읽음 표시는 readAt이 null인 행에만 있다(DOM에서 빠진다)', async () => {
    await openNotifications();
    await inboxLoaded();
    for (const n of [1, 2, 3, 4, 5]) expect(screen.getByTestId(`notifications.item-unread-${noti(n)}`), String(n)).toBeInTheDocument();
    for (const n of [6, 7, 20]) expect(screen.queryByTestId(`notifications.item-unread-${noti(n)}`), String(n)).not.toBeInTheDocument();
  });

  it('REQ-NOTI-004 문구로 알림 종류를 판단하지 않는다: 같은 type이어도 서버 문구가 달라도 같은 곳으로 간다', async () => {
    const { router } = await openNotifications({
      routes: {
        [PAGE1]: () => {
          const body = page1();
          body.notifications[0]!['title'] = '반려되었습니다';
          body.notifications[0]!['body'] = '아무 문구';
          return json(200, body);
        },
      },
    });
    await inboxLoaded();
    expect(tid(`notifications.item-title-${noti(1)}`)).toHaveTextContent('반려되었습니다');
    fireEvent.click(item(1));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/feed/${SOURCE_POST}`));
  });

  it('a11y: 화면 제목은 level 1 제목이고 목록은 이름 있는 list이며 행은 버튼이다', async () => {
    await openNotifications();
    await inboxLoaded();
    expect(screen.getByRole('heading', { level: 1, name: t('noti.inbox.title') })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: t('noti.inbox.title') })).toBe(tid('notifications.list'));
    expect(item(1).tagName).toBe('BUTTON');
    expect(item(1)).toHaveAccessibleName(expect.stringContaining('사진이 승인되었어요'));
    expect(item(1)).toHaveAccessibleName(expect.stringContaining('오늘의 사진이 전시에 올라갔어요.'));
    expect(tid('notifications.back-button')).toHaveAccessibleName(webOnlyCopy['noti.back']);
    expect(tid(`notifications.item-unread-${noti(1)}`)).toHaveAccessibleName(webOnlyCopy['noti.unread.a11y']);
  });

  it('a11y: 행의 접근성 이름에 읽지 않음 표시와 시각이 들어 있고 읽은 행에는 읽지 않음이 없다', async () => {
    await openNotifications();
    await inboxLoaded();
    expect(item(1)).toHaveAccessibleName(expect.stringContaining(webOnlyCopy['noti.unread.a11y']));
    expect(item(1)).toHaveAccessibleName(expect.stringContaining('10월 27일 10:30'));
    expect(item(6)).not.toHaveAccessibleName(expect.stringContaining(webOnlyCopy['noti.unread.a11y']));
  });

  it('TC-NOTI-001 알림함이 보이면 screen_view "notifications"가 한 번 기록된다', async () => {
    const { h } = await openNotifications();
    await inboxLoaded();
    expect(screenViews(h.tracker)).toEqual(['notifications']);
  });
});

describe('알림함 상태 (TC-NOTI-004~008)', () => {
  it('TC-NOTI-004 첫 로딩 중에는 문구 "알림을 불러오는 중이에요"가 있는 로딩 표시가 보이고 목록은 없다', async () => {
    const gate = deferred<void>();
    await openNotifications({ routes: { [PAGE1]: gated(gate, 'notification/notifications__page1') }, waitFor: 'notifications.loading' });
    const loading = tid('notifications.loading');
    expect(loading).toHaveTextContent(t('noti.inbox.loading'));
    expect(loading).toHaveAttribute('role', 'status');
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('notifications.list')).not.toBeInTheDocument();
    await act(async () => gate.resolve());
    await inboxLoaded();
  });

  it('TC-NOTI-005 빈 응답이면 빈 상태의 두 문구가 보이고 목록 행은 없다', async () => {
    await openNotifications({ routes: { [PAGE1]: 'notification/notifications__empty' }, waitFor: 'notifications.empty-state' });
    expect(tid('notifications.empty-state')).toHaveTextContent(t('noti.inbox.empty.title'));
    expect(tid('notifications.empty-state')).toHaveTextContent(t('noti.inbox.empty.body'));
    expect(screen.queryByTestId('notifications.loading')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId(/^notifications\.item-3333/)).toHaveLength(0);
    expect(screen.getByRole('button', { name: webOnlyCopy['noti.refresh'] })).toBeEnabled(); // 빈 상태에서도 새로고침
  });

  it('TC-NOTI-006 500이면 오류 문구 "알림을 불러오지 못했어요"와 "다시 시도"가 보이고 누르면 다시 요청해 목록이 나온다', async () => {
    const { fixtures } = await openNotifications({ routes: { [PAGE1]: 'notification/notifications__internal-error' }, waitFor: 'notifications.error-state' });
    expect(tid('notifications.error-state')).toHaveTextContent(t('noti.inbox.error'));
    expect(tid('notifications.retry-button')).toHaveTextContent(t('noti.inbox.retry'));
    expect(screen.queryByTestId('notifications.list')).not.toBeInTheDocument();
    fixtures.set(PAGE1, 'notification/notifications__page1');
    fireEvent.click(tid('notifications.retry-button'));
    await inboxLoaded();
    expect(fixtures.calls(PAGE1)).toHaveLength(1);
    expect(screen.queryByTestId('notifications.error-state')).not.toBeInTheDocument();
  });

  it('TC-NOTI-007 연결 실패면 "네트워크 연결을 확인해 주세요."를 보인다', async () => {
    await openNotifications({ routes: { [PAGE1]: failing }, waitFor: 'notifications.error-state' });
    expect(tid('notifications.error-state')).toHaveTextContent(t('noti.network'));
  });

  it('TC-NOTI-008 계약 위반 응답이면 크래시 없이 일반 오류 문구를 보인다', async () => {
    await openNotifications({ routes: { [PAGE1]: 'notification/notifications__missing-fields' }, waitFor: 'notifications.error-state' });
    expect(tid('notifications.error-state')).toHaveTextContent(t('noti.inbox.error'));
    expect(toastText()).toBeNull();
  });
});

describe('시각 표시 (TC-NOTI-012~014, D-09)', () => {
  const KST_BOUNDARY = { routes: { [PAGE1]: 'notification/notifications__kst-boundary' } };
  const times = () => [1, 2, 3].map((n) => tid(`notifications.item-time-${noti(n)}`).textContent);

  /** 프로세스 시간대를 바꿔 비동기 fn을 실행하고 되돌린다. */
  async function inTimeZone(tz: string, fn: () => Promise<void>) {
    const previous = process.env.TZ;
    process.env.TZ = tz;
    try {
      await fn();
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  }

  it('TC-NOTI-012 15:00Z·14:59:59Z·소수 초는 KST "M월 d일 HH:mm"로 자정 경계를 넘는다', async () => {
    await openNotifications(KST_BOUNDARY);
    await inboxLoaded();
    expect(times()).toEqual(['10월 27일 00:00', '10월 26일 23:59', '10월 27일 00:00']);
  });

  it.each(['UTC', 'America/Los_Angeles', 'Asia/Seoul', 'Pacific/Kiritimati'])('TC-NOTI-013 기기 시간대가 %s여도 같은 문자열이다', async (tz) => {
    await inTimeZone(tz, async () => {
      await openNotifications(KST_BOUNDARY);
      await inboxLoaded();
      expect(times()).toEqual(['10월 27일 00:00', '10월 26일 23:59', '10월 27일 00:00']);
    });
  });

  it('TC-NOTI-014 숫자를 다른 문자로 바꾸는 로캘(아랍어·태국어)·12시간제 기기에서도 24시간제 ASCII 숫자로 표시된다', async () => {
    const spies = [
      vi.spyOn(Number.prototype, 'toLocaleString').mockReturnValue('٢٠٢٦'),
      vi.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('٢٠٢٦/١٠/٢٧'),
      vi.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('١٢:٠٠ م'),
      vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('٢٠٢٦/١٠/٢٧ ١٢:٠٠ م'),
    ];
    try {
      await openNotifications(KST_BOUNDARY);
      await inboxLoaded();
      expect(times()).toEqual(['10월 27일 00:00', '10월 26일 23:59', '10월 27일 00:00']);
      expect(times().join('')).toMatch(/^[0-9월일: ]+$/);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

describe('다음 페이지 스크롤 (TC-NOTI-015, 016, 018)', () => {
  it('TC-NOTI-015 끝에서 4번째 항목 앞에 센티넬이 놓이고 보이면 page=2를 한 번만 요청해 뒤에 붙인다', async () => {
    const observer = new FakeVisibilityObserver();
    const { fixtures } = await openNotifications({ visibilityObserver: observer.factory });
    await inboxLoaded();
    const target = observer.targets[observer.targets.length - 1]!;
    expect(tid('notifications.list')).toContainElement(target as HTMLElement);
    const after = screen.getAllByTestId(/^notifications\.item-3333/).filter((el) => (target.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
    expect(after).toHaveLength(4);
    await act(async () => observer.show());
    await waitFor(() => expect(itemIds()).toHaveLength(25));
    expect(fixtures.calls(PAGE2)).toHaveLength(1);
    expect(fixtures.calls(PAGE2)[0]!.query.get('page')).toBe('2');
    expect(itemIds().slice(-5)).toEqual(['21', '22', '23', '24', '25']);
  });

  it('TC-NOTI-015 다음 페이지를 읽는 동안 목록 끝에 진행 표시가 보이고 같은 위치에서 또 보여도 요청이 늘지 않는다', async () => {
    const gate = deferred<void>();
    const observer = new FakeVisibilityObserver();
    const { fixtures } = await openNotifications({ visibilityObserver: observer.factory, routes: { [PAGE2]: gated(gate, 'notification/notifications__page2-last') } });
    await inboxLoaded();
    await act(async () => observer.show());
    expect(await screen.findByTestId('notifications.load-more-indicator')).toHaveTextContent(webOnlyCopy['noti.load-more']);
    await act(async () => observer.show());
    expect(fixtures.calls(PAGE2)).toHaveLength(1);
    await act(async () => gate.resolve());
    await waitFor(() => expect(screen.queryByTestId('notifications.load-more-indicator')).not.toBeInTheDocument());
  });

  it('TC-NOTI-016 hasNext=false인 목록은 센티넬이 없고 어떤 신호에도 요청이 늘지 않는다', async () => {
    const observer = new FakeVisibilityObserver();
    const { h, fixtures } = await openNotifications({ visibilityObserver: observer.factory, routes: { [PAGE1]: 'notification/notifications__empty' } });
    await screen.findByTestId('notifications.empty-state');
    await act(async () => observer.show());
    expect(h.ff.calls.filter((c) => c.path === '/notifications')).toHaveLength(1);
    expect(fixtures.calls(PAGE2)).toHaveLength(0);
  });

  it('TC-NOTI-018 다음 페이지가 실패하면 토스트를 띄우고 목록을 유지하며 다시 스크롤하면 같은 page=2를 다시 요청한다', async () => {
    const observer = new FakeVisibilityObserver();
    const { h, fixtures } = await openNotifications({ visibilityObserver: observer.factory, routes: { [PAGE2]: 'notification/notifications__internal-error' } });
    await inboxLoaded();
    await act(async () => observer.show());
    await advance(h, 3_000);
    await waitFor(() => expect(toastText()).toBe(t('noti.inbox.more-error')));
    expect(itemIds()).toHaveLength(20);
    fixtures.set(PAGE2, 'notification/notifications__page2-last');
    await act(async () => observer.show());
    await waitFor(() => expect(itemIds()).toHaveLength(25));
    expect(fixtures.calls(PAGE2)).toHaveLength(1);
    expect(fixtures.calls(PAGE2)[0]!.query.get('page')).toBe('2');
  });

  it('TC-NOTI-017 2페이지에 겹치는 id가 있어도 화면에는 한 번씩만 보인다', async () => {
    const observer = new FakeVisibilityObserver();
    await openNotifications({ visibilityObserver: observer.factory, routes: { [PAGE2]: 'notification/notifications__overlap-page2' } });
    await inboxLoaded();
    await act(async () => observer.show());
    await waitFor(() => expect(itemIds()).toHaveLength(23));
    expect(new Set(itemIds()).size).toBe(23);
  });
});

async function advance(h: { clock: { advance(ms: number): Promise<void> } }, ms: number) {
  await act(async () => {
    await h.clock.advance(ms);
  });
}

describe('새로고침 버튼 (TC-NOTI-019, 020, REQ-NOTI-010)', () => {
  const refreshButton = () => screen.getByRole('button', { name: webOnlyCopy['noti.refresh'] });

  it('TC-NOTI-019 누르면 기존 목록을 둔 채 새로고침 표시를 보이다가 첫 페이지로 교체하고 끝나면 표시가 사라진다', async () => {
    const gate = deferred<void>();
    const observer = new FakeVisibilityObserver();
    const { fixtures } = await openNotifications({ visibilityObserver: observer.factory });
    await inboxLoaded();
    await act(async () => observer.show());
    await waitFor(() => expect(itemIds()).toHaveLength(25));
    fixtures.set(PAGE1, gated(gate, 'notification/notifications__page1'));
    fireEvent.click(refreshButton());
    expect(await screen.findByTestId('notifications.refresh-indicator')).toHaveTextContent(webOnlyCopy['noti.refresh-indicator']);
    expect(refreshButton()).toBeDisabled();
    expect(itemIds()).toHaveLength(25);
    await act(async () => gate.resolve());
    await waitFor(() => expect(screen.queryByTestId('notifications.refresh-indicator')).not.toBeInTheDocument());
    expect(itemIds()).toHaveLength(20);
    expect(refreshButton()).toBeEnabled();
  });

  it('TC-NOTI-020 실패하면 기존 목록을 유지하고 새로고침 실패 토스트만 보인다', async () => {
    const { h, fixtures } = await openNotifications();
    await inboxLoaded();
    fixtures.set(PAGE1, 'notification/notifications__internal-error');
    fireEvent.click(refreshButton());
    await advance(h, 3_000);
    await waitFor(() => expect(toastText()).toBe(t('noti.inbox.refresh-error')));
    expect(itemIds()).toHaveLength(20);
    expect(screen.queryByTestId('notifications.error-state')).not.toBeInTheDocument();
    expect(screen.queryByTestId('notifications.refresh-indicator')).not.toBeInTheDocument();
  });
});

describe('행 탭과 이동 (TC-NOTI-024~031, 038)', () => {
  const pathOf = (router: { state: { location: { pathname: string } } }) => router.state.location.pathname;

  it('TC-NOTI-027 승인 알림을 누르면 읽음 PATCH 뒤 게시물 상세(/feed/{sourceId})로 push 이동한다', async () => {
    const { router, fixtures } = await openNotifications();
    await inboxLoaded();
    fireEvent.click(item(1));
    await waitFor(() => expect(pathOf(router)).toBe(`/feed/${SOURCE_POST}`));
    expect(fixtures.calls(readKey(1))).toHaveLength(1);
    expect(router.state.historyAction).toBe('PUSH');
    expect(readOpenAiReview(router.state.location.state)).toBe(false);
  });

  it.each([3, 4])('TC-NOTI-028 AI 알림(%i)을 누르면 게시물 상세로 가고 AI 시트 자동 열기(openAiReview) 상태가 실린다', async (n) => {
    const { router } = await openNotifications();
    await inboxLoaded();
    fireEvent.click(item(n));
    await waitFor(() => expect(pathOf(router)).toBe(`/feed/${SOURCE_POST}`));
    expect(readOpenAiReview(router.state.location.state)).toBe(true);
  });

  it.each([
    ['TC-NOTI-030 공지', 5],
    ['TC-NOTI-031 반려', 2],
  ])('%s 알림을 누르면 읽음 뒤 알림 상세(/notifications/{알림 id})가 열린다', async (_name, n) => {
    const { router, fixtures } = await openNotifications();
    await inboxLoaded();
    fireEvent.click(item(n));
    await waitFor(() => expect(pathOf(router)).toBe(`/notifications/${noti(n)}`));
    expect(fixtures.calls(readKey(n))).toHaveLength(1);
    expect(await screen.findByTestId('notification-detail.root')).toBeInTheDocument();
  });

  it('TC-NOTI-025 TOPIC·REMINDER 행을 누르면 읽음 요청 없이 홈으로 이동한다', async () => {
    const { router, h } = await openNotifications({ routes: { [PAGE1]: 'notification/notifications__topic-reminder' } });
    await inboxLoaded();
    fireEvent.click(item(31));
    await waitFor(() => expect(pathOf(router)).toBe('/home'));
    expect(h.ff.calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
  });

  it.each([
    ['TC-NOTI-024 알 수 없는 type', 'notification/notifications__unknown-type', 1],
    ['TC-NOTI-026 sourceId가 null인 승인', 'notification/notifications__null-source', 1],
    ['TC-NOTI-029 sourceType이 NOTICE인 AI 알림', 'notification/notifications__bad-ai-source', 3],
  ])('%s: 행은 보이지만 눌러도 알림함에 머물고 읽음 요청·토스트가 없다', async (_name, fixture, n) => {
    const { router, h } = await openNotifications({ routes: { [PAGE1]: fixture } });
    await inboxLoaded();
    fireEvent.click(item(n));
    await act(async () => {
      await h.clock.advance(1_000);
    });
    expect(pathOf(router)).toBe('/notifications');
    expect(h.ff.calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
    expect(toastText()).toBeNull();
    expect(screen.queryByTestId('notifications.error-state')).not.toBeInTheDocument();
  });

  it('TC-NOTI-038 같은 행을 빠르게 연타해도 읽음 PATCH 1회, 이동 1회다(뒤로 한 번에 알림함으로 돌아온다)', async () => {
    const gate = deferred<void>();
    const { router, fixtures } = await openNotifications({ routes: { [readKey(1)]: gated(gate, 'notification/notification-read__no-content') } });
    await inboxLoaded();
    fireEvent.click(item(1));
    fireEvent.click(item(1));
    fireEvent.click(item(1));
    await act(async () => gate.resolve());
    await waitFor(() => expect(pathOf(router)).toBe(`/feed/${SOURCE_POST}`));
    expect(fixtures.calls(readKey(1))).toHaveLength(1);
    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(() => expect(pathOf(router)).toBe('/notifications'));
  });

  it('TC-NOTI-032 읽음 요청이 연결 실패면 토스트 "읽음 상태를 저장하지 못했어요…"를 띄우고 그래도 이동하며 미읽음 표시는 남는다', async () => {
    const { router, h } = await openNotifications({ routes: { [readKey(1)]: failing } });
    await inboxLoaded();
    fireEvent.click(item(1));
    await advance(h, 3_000);
    await waitFor(() => expect(pathOf(router)).toBe(`/feed/${SOURCE_POST}`));
    expect(toastText()).toBe(t('noti.read.error.network'));
    await act(async () => {
      await router.navigate(-1);
    });
    await screen.findByTestId('notifications.list');
    expect(screen.getByTestId(`notifications.item-unread-${noti(1)}`)).toBeInTheDocument();
  });

  it('TC-NOTI-033 읽음 요청이 404면 이동하지 않고 "더 이상 확인할 수 없는 알림이에요." 토스트와 함께 목록을 다시 불러와 항목이 사라진다', async () => {
    const { router, fixtures } = await openNotifications({ routes: { [readKey(1)]: 'notification/notification-read__not-found' } });
    await inboxLoaded();
    fixtures.set(PAGE1, () => {
      const body = page1();
      return json(200, { ...body, notifications: body.notifications.slice(1) });
    });
    fireEvent.click(item(1));
    await waitFor(() => expect(toastText()).toBe(t('noti.gone')));
    await waitFor(() => expect(screen.queryByTestId(`notifications.item-${noti(1)}`)).not.toBeInTheDocument());
    expect(pathOf(router)).toBe('/notifications');
    expect(fixtures.calls(PAGE1)).toHaveLength(1);
  });

  it('TC-NOTI-036 읽음 처리한 뒤 알림함으로 돌아오면 그 행만 읽음이다(서버 값을 조용히 다시 불러와도 유지)', async () => {
    const { router, fixtures } = await openNotifications();
    const server = createNotificationServer(fixtures);
    await inboxLoaded();
    expect(screen.getByTestId(`notifications.item-unread-${noti(2)}`)).toBeInTheDocument();
    fireEvent.click(item(2));
    await waitFor(() => expect(pathOf(router)).toBe(`/notifications/${noti(2)}`));
    expect(server.read.has(noti(2))).toBe(true);
    await act(async () => {
      await router.navigate(-1);
    });
    await screen.findByTestId('notifications.list');
    await waitFor(() => expect(screen.queryByTestId(`notifications.item-unread-${noti(2)}`)).not.toBeInTheDocument());
    expect(screen.getByTestId(`notifications.item-unread-${noti(1)}`)).toBeInTheDocument();
    expect(screen.getByTestId(`notifications.item-unread-${noti(5)}`)).toBeInTheDocument();
  });
});

describe('알림함 뒤로 (planInboxClose)', () => {
  it('새로고침·딥링크로 첫 항목이 된 알림함의 뒤로 버튼은 홈으로 replace한다', async () => {
    const { router } = await openNotifications();
    await inboxLoaded();
    fireEvent.click(tid('notifications.back-button'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'));
    expect(router.state.historyAction).toBe('REPLACE');
  });
});
