import { networkFailure } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { t } from '../../shared/copy';
import {
  createNotificationHarness,
  deferredRoute,
  flush,
  LIST_P1,
  LIST_P2,
  nid,
  readKey,
  UNREAD,
  type NotificationHarness,
} from './__testing__/createNotificationHarness';
import { NotificationInboxViewModel } from './NotificationInboxViewModel';

const READ_OK = 'notification/notification-read__no-content';

async function setup(options: Parameters<typeof createNotificationHarness>[0] = {}) {
  const h = await createNotificationHarness(options);
  const viewModel = new NotificationInboxViewModel({
    notifications: h.repository,
    processor: h.processor,
    events: h.events,
    toast: h.toast,
    authFlow: h.authFlow,
    analytics: h.analytics,
  });
  return { ...h, viewModel };
}
type Harness = Awaited<ReturnType<typeof setup>>;
const ids = (h: Harness) => h.viewModel.getSnapshot().items.map((i) => i.id.slice(-2));
const gets = (h: NotificationHarness, key = LIST_P1) => h.router.calls(key);

describe('NotificationInboxViewModel 첫 로드', () => {
  it('TC-NOTI-004 로딩 중 status는 loading이다', async () => {
    const gate = deferredRoute('notification/notifications__page1');
    const h = await setup({ routes: { [LIST_P1]: gate.value } });
    const run = h.viewModel.onShown();
    await flush();
    expect(h.viewModel.getSnapshot().status).toBe('loading');
    gate.release();
    await run;
    expect(h.viewModel.getSnapshot().status).toBe('ready');
  });

  it('TC-NOTI-002 TC-NOTI-011 응답 순서대로 20개를 보이고 제목·본문·미읽음·썸네일을 담는다', async () => {
    const h = await setup();
    await h.viewModel.onShown();
    const s = h.viewModel.getSnapshot();
    expect(gets(h)).toHaveLength(1);
    expect(s.items).toHaveLength(20);
    expect(s.hasNext).toBe(true);
    expect(s.items[0]).toMatchObject({
      id: nid('01'),
      title: '사진이 승인되었어요',
      body: '오늘의 사진이 전시에 올라갔어요.',
      unread: true,
      thumbnailUrl: expect.stringContaining('thumbnail.webp'),
    });
    expect(s.items[4].thumbnailUrl).toBeNull();
    expect(s.items[5].unread).toBe(false);
  });

  it('TC-NOTI-012 시각은 KST "M월 d일 HH:mm"로 표시한다(UTC 15:00 -> 다음날 00:00, 14:59:59 -> 23:59)', async () => {
    const h = await setup({ routes: { [LIST_P1]: 'notification/notifications__kst-boundary' } });
    await h.viewModel.onShown();
    const [a, b] = h.viewModel.getSnapshot().items;
    expect(a.timeLabel).toBe('10월 27일 00:00');
    expect(b.timeLabel).toBe('10월 26일 23:59');
  });

  it('REQ-NOTI-014 TC-NOTI-001 화면이 보일 때마다 screen_view notifications를 보낸다', async () => {
    const h = await setup();
    await h.viewModel.onShown();
    expect(h.analytics.screenNames).toEqual(['notifications']);
  });

  it('TC-NOTI-005 빈 응답은 empty 상태', async () => {
    const h = await setup({ routes: { [LIST_P1]: 'notification/notifications__empty' } });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().status).toBe('empty');
  });

  it('TC-NOTI-006 실패하고 콘텐츠가 없으면 오류 상태, retry가 재요청한다', async () => {
    const h = await setup({
      routes: {
        [LIST_P1]: [
          'notification/notifications__internal-error',
          'notification/notifications__page1',
        ],
      },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({
      status: 'error',
      errorMessage: t('noti.inbox.error'),
    });
    await h.viewModel.retry();
    expect(h.viewModel.getSnapshot().status).toBe('ready');
  });

  it('TC-NOTI-007 네트워크 오류는 "네트워크 연결을 확인해 주세요."', async () => {
    const h = await setup({ routes: { [LIST_P1]: networkFailure() } });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({
      status: 'error',
      errorMessage: t('noti.network'),
    });
  });

  it('TC-NOTI-008 계약 위반 응답은 일반 오류 문구이고 크래시하지 않는다', async () => {
    const h = await setup({ routes: { [LIST_P1]: 'notification/notifications__missing-fields' } });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({
      status: 'error',
      errorMessage: t('noti.inbox.error'),
    });
  });

  it('TC-NOTI-009 401 UNAUTHORIZED가 갱신 뒤에도 남으면 로그인으로, 오류 화면·토스트는 없다', async () => {
    const h = await setup({ routes: { [LIST_P1]: 'notification/notifications__unauthorized' } });
    await h.viewModel.onShown();
    expect(h.authFlow.calls).toEqual(['login']);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-NOTI-009 REAUTHENTICATION_REQUIRED는 화면이 아무것도 하지 않는다(세션 이벤트가 로그인으로 보낸다)', async () => {
    const h = await setup({
      routes: {
        [LIST_P1]: 'notification/notifications__unauthorized',
        'POST /auth/refresh': fixtureResponse('auth/refresh__reauthentication-required'),
      },
    });
    await h.viewModel.onShown();
    expect(h.authFlow.calls).toEqual([]);
    expect(h.toast.messages).toEqual([]);
    expect(h.emitted).toEqual([{ type: 'session-expired' }]);
  });

  it('TC-NOTI-023 서버가 준 오래된 항목을 날짜로 거르지 않는다', async () => {
    const h = await setup({ routes: { [LIST_P1]: 'notification/notifications__30day-boundary' } });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().items).toHaveLength(2);
  });
});

describe('NotificationInboxViewModel 페이징·새로고침', () => {
  it('TC-NOTI-015 마지막 4개 근처에서 page=2를 1회만 요청한다', async () => {
    const gate = deferredRoute('notification/notifications__page2-last');
    const h = await setup({ routes: { [LIST_P2]: gate.value } });
    await h.viewModel.onShown();
    await h.viewModel.onLastVisibleIndexChanged(15);
    expect(gets(h, LIST_P2)).toHaveLength(0);
    const first = h.viewModel.onLastVisibleIndexChanged(16);
    await flush();
    expect(h.viewModel.getSnapshot().loadingMore).toBe(true);
    await h.viewModel.onLastVisibleIndexChanged(17);
    await h.viewModel.onLastVisibleIndexChanged(19);
    gate.release();
    await first;
    expect(gets(h, LIST_P2)).toHaveLength(1);
    expect(ids(h)).toHaveLength(25);
    expect(h.viewModel.getSnapshot().hasNext).toBe(false);
  });

  it('TC-NOTI-016 hasNext=false면 끝까지 스크롤해도 추가 요청이 없다', async () => {
    const h = await setup({ routes: { [LIST_P1]: 'notification/notifications__page2-last' } });
    await h.viewModel.onShown();
    await h.viewModel.onLastVisibleIndexChanged(4);
    expect(gets(h, LIST_P2)).toHaveLength(0);
  });

  it('TC-NOTI-017 2페이지의 중복 id는 제거하고 순서를 유지한다', async () => {
    const h = await setup({ routes: { [LIST_P2]: 'notification/notifications__overlap-page2' } });
    await h.viewModel.onShown();
    await h.viewModel.onLastVisibleIndexChanged(19);
    expect(ids(h)).toEqual([
      ...Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0')),
      '26',
      '27',
      '28',
    ]);
  });

  it('TC-NOTI-018 다음 페이지 실패는 목록·페이지를 유지하고 more-error 토스트, 같은 페이지로 재시도할 수 있다', async () => {
    const h = await setup({
      routes: {
        [LIST_P2]: [
          'notification/notifications__internal-error',
          'notification/notifications__page2-last',
        ],
      },
    });
    await h.viewModel.onShown();
    await h.viewModel.onLastVisibleIndexChanged(19);
    expect(h.toast.messages).toEqual([t('noti.inbox.more-error')]);
    expect(ids(h)).toHaveLength(20);
    expect(h.viewModel.getSnapshot().loadingMore).toBe(false);
    await h.viewModel.onLastVisibleIndexChanged(19);
    expect(ids(h)).toHaveLength(25);
    expect(gets(h, LIST_P2).length).toBeGreaterThanOrEqual(2);
  });

  it('TC-NOTI-019 새로고침 성공은 목록을 교체하고 페이지를 1로 되돌린다', async () => {
    const h = await setup();
    await h.viewModel.onShown();
    await h.viewModel.onLastVisibleIndexChanged(19);
    expect(ids(h)).toHaveLength(25);
    h.router.set(LIST_P1, 'notification/notifications__topic-reminder');
    await h.viewModel.refresh();
    expect(ids(h)).toEqual(['31', '32']);
    h.router.set(LIST_P1, 'notification/notifications__page1');
    await h.viewModel.refresh();
    await h.viewModel.onLastVisibleIndexChanged(19);
    expect(gets(h, LIST_P2)).toHaveLength(2); // 새로고침 뒤 다음 페이지는 다시 page=2부터
  });

  it('TC-NOTI-020 REQ-NOTI-010 새로고침 실패는 기존 목록을 유지하고 refresh-error 토스트만 띄운다', async () => {
    const h = await setup();
    await h.viewModel.onShown();
    h.router.set(LIST_P1, 'notification/notifications__internal-error');
    await h.viewModel.refresh();
    expect(h.viewModel.getSnapshot().status).toBe('ready');
    expect(ids(h)).toHaveLength(20);
    expect(h.toast.messages).toEqual([t('noti.inbox.refresh-error')]);
    expect(h.viewModel.getSnapshot().refreshing).toBe(false);
  });

  it('TC-NOTI-021 새로고침이 겹치면 늦게 끝난 이전 응답은 버린다', async () => {
    const slow = deferredRoute('notification/notifications__page1');
    const h = await setup({
      routes: { [LIST_P1]: slow.value },
    });
    const first = h.viewModel.onShown();
    await flush();
    h.router.set(LIST_P1, 'notification/notifications__topic-reminder');
    await h.viewModel.refresh();
    expect(ids(h)).toEqual(['31', '32']);
    slow.release();
    await first;
    expect(ids(h)).toEqual(['31', '32']);
  });

  it('당겨서 새로고침 중 gone 이벤트가 조용한 새로고침으로 대체해도 refreshing이 남지 않는다', async () => {
    const h = await setup();
    await h.viewModel.onShown();
    const slow = deferredRoute('notification/notifications__page1');
    h.router.set(LIST_P1, slow.value);
    const pull = h.viewModel.refresh();
    await flush();
    expect(h.viewModel.getSnapshot().refreshing).toBe(true);
    h.router.set(LIST_P1, 'notification/notifications__page1');
    h.events.emit({ type: 'gone', notificationId: nid('01') });
    await flush();
    slow.release();
    await pull;
    await flush();
    expect(h.viewModel.getSnapshot().refreshing).toBe(false);
  });

  it('TC-NOTI-022 화면을 떠나면(onHidden) 진행 중 요청의 응답이 와도 오류 토스트가 없다', async () => {
    const gate = deferredRoute('notification/notifications__page1');
    const h = await setup({ routes: { [LIST_P1]: gate.value } });
    const run = h.viewModel.onShown();
    await flush();
    h.viewModel.onHidden();
    gate.release();
    await run;
    expect(h.toast.messages).toEqual([]);
    expect(h.viewModel.getSnapshot().status).not.toBe('error');
  });

  it('REQ-NOTI-012 다시 보일 때는 조용히 첫 페이지를 다시 불러오고, 실패해도 목록 유지·토스트 없음', async () => {
    const h = await setup();
    await h.viewModel.onShown();
    h.router.set(LIST_P1, 'notification/notifications__internal-error');
    await h.viewModel.onShown();
    // router.set이 호출 기록을 새로 시작하므로 실패한 조용한 재조회 1번만 센다.
    expect(gets(h, LIST_P1)).toHaveLength(1);
    expect(ids(h)).toHaveLength(20);
    expect(h.toast.messages).toEqual([]);
    expect(h.viewModel.getSnapshot().status).toBe('ready');
    expect(h.analytics.screenNames).toEqual(['notifications', 'notifications']);
  });
});

describe('NotificationInboxViewModel 행 탭', () => {
  it('TC-NOTI-027 TC-NOTI-036 행 탭은 읽음 PATCH 뒤 이동하고 그 행만 읽음으로 바뀐다', async () => {
    const h = await setup({ routes: { [readKey(nid('01'))]: READ_OK } });
    await h.viewModel.onShown();
    await h.viewModel.onItemPressed(nid('01'));
    expect(h.router.calls(readKey(nid('01')))).toHaveLength(1);
    expect(h.navigator.calls).toEqual([
      { type: 'post-detail', postId: '22222222-2222-4222-8222-222222222201', openAiSheet: false },
    ]);
    const items = h.viewModel.getSnapshot().items;
    expect(items[0].unread).toBe(false);
    expect(items[1].unread).toBe(true);
  });

  it('TC-NOTI-037 이미 읽은 행을 다시 탭해도 PATCH를 보내고 이동한다(읽은 상태 유지)', async () => {
    const h = await setup({ routes: { [readKey(nid('06'))]: READ_OK } });
    await h.viewModel.onShown();
    await h.viewModel.onItemPressed(nid('06'));
    expect(h.router.calls(readKey(nid('06')))).toHaveLength(1);
    expect(h.viewModel.getSnapshot().items[5].unread).toBe(false);
    expect(h.navigator.calls).toHaveLength(1);
  });

  it('TC-NOTI-032 읽음 네트워크 실패는 토스트 + 이동, 행은 미읽음 그대로', async () => {
    const h = await setup({ routes: { [readKey(nid('01'))]: networkFailure() } });
    await h.viewModel.onShown();
    await h.viewModel.onItemPressed(nid('01'));
    expect(h.toast.messages).toEqual([t('noti.read.error.network')]);
    expect(h.navigator.calls).toHaveLength(1);
    expect(h.viewModel.getSnapshot().items[0].unread).toBe(true);
  });

  it('TC-NOTI-033 읽음 404는 gone 토스트, 이동 없음, 목록을 다시 불러온다', async () => {
    const h = await setup({
      routes: { [readKey(nid('01'))]: 'notification/notification-read__not-found' },
    });
    await h.viewModel.onShown();
    await h.viewModel.onItemPressed(nid('01'));
    expect(h.toast.messages).toEqual([t('noti.gone')]);
    expect(h.navigator.calls).toEqual([]);
    await flush();
    expect(gets(h, LIST_P1)).toHaveLength(2);
    expect(h.home.unreadRefreshes).toBe(1);
  });

  it('TC-NOTI-038 같은 행 연타는 PATCH 1회, 이동 1회', async () => {
    const gate = deferredRoute(READ_OK);
    const h = await setup({ routes: { [readKey(nid('01'))]: gate.value } });
    await h.viewModel.onShown();
    const first = h.viewModel.onItemPressed(nid('01'));
    await flush();
    await h.viewModel.onItemPressed(nid('01'));
    await h.viewModel.onItemPressed(nid('01'));
    gate.release();
    await first;
    expect(h.router.calls(readKey(nid('01')))).toHaveLength(1);
    expect(h.navigator.calls).toHaveLength(1);
  });

  it('TC-NOTI-024 알 수 없는 type 행은 보이지만 탭해도 아무 일도 없다', async () => {
    const h = await setup({ routes: { [LIST_P1]: 'notification/notifications__unknown-type' } });
    await h.viewModel.onShown();
    expect(ids(h)).toEqual(['01']);
    await h.viewModel.onItemPressed(nid('01'));
    expect(h.transport.requests.filter((r) => r.method === 'PATCH')).toHaveLength(0);
    expect(h.navigator.calls).toEqual([]);
  });

  it('TC-NOTI-025 TOPIC·REMINDER 행은 홈으로 이동하고 읽음 요청은 없다', async () => {
    const h = await setup({ routes: { [LIST_P1]: 'notification/notifications__topic-reminder' } });
    await h.viewModel.onShown();
    await h.viewModel.onItemPressed(nid('31'));
    await h.viewModel.onItemPressed(nid('32'));
    expect(h.navigator.calls).toEqual([{ type: 'home' }, { type: 'home' }]);
    expect(h.transport.requests.filter((r) => r.method === 'PATCH')).toHaveLength(0);
  });

  it('TC-NOTI-039 탭 처리 중 화면을 떠나면(onHidden) 이동하지 않고 오류도 없다', async () => {
    const gate = deferredRoute(READ_OK);
    const h = await setup({ routes: { [readKey(nid('01'))]: gate.value } });
    await h.viewModel.onShown();
    const run = h.viewModel.onItemPressed(nid('01'));
    await flush();
    h.viewModel.onHidden();
    gate.release();
    await run;
    expect(h.navigator.calls).toEqual([]);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-PUSH-027 푸시 탭에서 온 gone 이벤트에도 열려 있는 알림함이 조용히 새로고침된다', async () => {
    const h = await setup();
    await h.viewModel.onShown();
    h.events.emit({ type: 'gone', notificationId: nid('99') });
    await flush();
    expect(gets(h, LIST_P1)).toHaveLength(2);
    expect(h.toast.messages).toEqual([]);
  });
});

describe('NotificationInboxViewModel 계정 전환', () => {
  it('TC-NOTI-040 clearAll(로그아웃·계정 전환)은 목록을 비우고 늦게 온 응답을 반영하지 않는다', async () => {
    const gate = deferredRoute('notification/notifications__page1');
    const h = await setup({ routes: { [LIST_P1]: gate.value } });
    const run = h.viewModel.onShown();
    await flush();
    await h.viewModel.clearAll();
    gate.release();
    await run;
    expect(h.viewModel.getSnapshot().items).toEqual([]);
  });

  it('REQ-NOTI-013 모두 읽음 API는 호출하지 않는다', async () => {
    const h = await setup();
    await h.viewModel.onShown();
    expect(h.transport.requests.some((r) => r.url.includes('read-all'))).toBe(false);
    expect(h.router.calls(UNREAD)).toHaveLength(0);
  });
});
