import { deferred } from '../../test/deferred';
import { gated } from '../../test/displayAsserts';
import { json } from '../../test/fixtureRouter';
import { loadFixture } from '../../test/fixtures';
import { createNotificationHarness, finish, itemsOf, noti, numbers, PAGE1, readKey, settle, SOURCE_POST, upTo } from '../../test/notificationHarness';
import type { NotificationHarness } from '../../test/notificationHarness';

const T = {
  network: '읽음 상태를 저장하지 못했어요. 네트워크 연결을 확인해 주세요.',
  gone: '더 이상 확인할 수 없는 알림이에요.',
};
const failing = () => {
  throw new TypeError('Failed to fetch');
};
const patches = (h: NotificationHarness) => h.ff.calls.filter((c) => c.method === 'PATCH');

/** 알림함을 열고 { h, vm }을 돌려준다. */
async function open(options: Parameters<typeof createNotificationHarness>[0] = {}) {
  const h = createNotificationHarness(options);
  const vm = await h.openInbox();
  return { h, vm };
}

describe('행 탭: 목적지와 읽음 (REQ-NOTI-015, 016, D-11)', () => {
  it('TC-NOTI-027 POST_APPROVED: 읽음 PATCH 1회 성공 뒤 게시물 상세로 이동하고 그 행만 읽음이 되며 미읽음 점을 다시 조회한다', async () => {
    const { h, vm } = await open();
    expect(itemsOf(vm.state)[0]!.readAt).toBeNull();
    await finish(h, vm.onItemPress(noti(1)));
    expect(h.router.calls(readKey(1))).toHaveLength(1);
    expect(h.router.calls(readKey(1))[0]!.method).toBe('PATCH');
    expect(h.navigator.calls).toEqual([{ type: 'post', postId: SOURCE_POST, openAiReview: false }]);
    expect(itemsOf(vm.state)[0]!.readAt).toBe(h.clock.nowMs());
    expect(itemsOf(vm.state)[1]!.readAt).toBeNull(); // 다른 행은 그대로
    expect(h.sync.unreadRefreshes).toBe(1);
    expect(h.toasts.messages).toEqual([]);
  });

  it.each([3, 4])('TC-NOTI-028 AI 알림(%i): 읽음 성공 뒤 게시물 상세 + AI 시트 자동 열기 플래그로 이동한다', async (n) => {
    const { h, vm } = await open();
    await finish(h, vm.onItemPress(noti(n)));
    expect(h.navigator.calls).toEqual([{ type: 'post', postId: SOURCE_POST, openAiReview: true }]);
    expect(h.router.calls(readKey(n))).toHaveLength(1);
  });

  it('TC-NOTI-030 NOTICE: 읽음 성공 뒤 알림 id로 알림 상세를 연다(공지 sourceId가 아니다)', async () => {
    const { h, vm } = await open();
    await finish(h, vm.onItemPress(noti(5)));
    expect(h.navigator.calls).toEqual([{ type: 'detail', notificationId: noti(5) }]);
    expect(h.router.calls(readKey(5))).toHaveLength(1);
  });

  it('TC-NOTI-031 POST_REJECTED: 읽음 성공 뒤 알림 상세를 연다', async () => {
    const { h, vm } = await open();
    await finish(h, vm.onItemPress(noti(2)));
    expect(h.navigator.calls).toEqual([{ type: 'detail', notificationId: noti(2) }]);
  });

  it('TC-NOTI-036 읽음 성공 뒤 목록을 다시 보면 그 항목만 읽음 상태이고 나머지 읽음 상태는 그대로다', async () => {
    const { h, vm } = await open();
    const before = itemsOf(vm.state).map((item) => item.readAt === null);
    await finish(h, vm.onItemPress(noti(2)));
    const after = itemsOf(vm.state).map((item) => item.readAt === null);
    expect(before.filter(Boolean)).toHaveLength(5);
    expect(after.filter(Boolean)).toHaveLength(4);
    expect(after.map((unread, i) => (unread === before[i] ? null : i))).toEqual([null, 1, ...Array(18).fill(null)]);
  });

  it('TC-NOTI-037 이미 읽은 항목을 다시 탭해도 멱등 PATCH를 보내 성공으로 처리하고 최초 readAt을 유지한다(확인 필요 3의 임시 결정)', async () => {
    const { h, vm } = await open();
    const first = itemsOf(vm.state)[5]!;
    expect(first.id).toBe(noti(6));
    expect(first.readAt).not.toBeNull();
    await finish(h, vm.onItemPress(noti(6)));
    expect(h.router.calls(readKey(6))).toHaveLength(1);
    expect(itemsOf(vm.state)[5]!.readAt).toBe(first.readAt);
    expect(h.navigator.calls).toEqual([{ type: 'post', postId: '22222222-2222-4222-8222-222222222208', openAiReview: false }]);
    expect(h.toasts.messages).toEqual([]);
  });

  it('목록에 없는 id를 누르면 아무 일도 없다', async () => {
    const { h, vm } = await open();
    await finish(h, vm.onItemPress(noti(99)));
    expect(patches(h)).toHaveLength(0);
    expect(h.navigator.calls).toEqual([]);
  });

  it('목록이 로딩 중일 때의 탭은 아무 일도 없다', async () => {
    const h = createNotificationHarness();
    const vm = h.inbox();
    await vm.onItemPress(noti(1));
    expect(patches(h)).toHaveLength(0);
    expect(h.navigator.calls).toEqual([]);
  });
});

describe('행 탭: 이동하지 않는 행 (REQ-NOTI-021, 022)', () => {
  it('TC-NOTI-025 TOPIC·REMINDER 행은 읽음 요청 없이 홈으로 이동한다', async () => {
    const { h, vm } = await open({ routes: { [PAGE1]: 'notification/notifications__topic-reminder' } });
    await finish(h, vm.onItemPress(noti(31)));
    await finish(h, vm.onItemPress(noti(32)));
    expect(h.navigator.calls).toEqual([{ type: 'home' }, { type: 'home' }]);
    expect(patches(h)).toHaveLength(0);
    expect(h.sync.unreadRefreshes).toBe(0);
    expect(h.toasts.messages).toEqual([]);
  });

  it.each([
    ['TC-NOTI-024 알 수 없는 type(FUTURE_TYPE)', 'notification/notifications__unknown-type', [1]],
    ['TC-NOTI-026 POST_APPROVED인데 sourceType·sourceId가 null', 'notification/notifications__null-source', [1]],
    ['TC-NOTI-029 AI 알림의 sourceType이 POST가 아니거나 sourceId가 UUID가 아님', 'notification/notifications__bad-ai-source', [3, 8]],
  ])('%s: 목록에는 보이지만 탭해도 이동·읽음 요청·토스트가 없고 오류도 아니다', async (_name, fixture, numbersToTap) => {
    const { h, vm } = await open({ routes: { [PAGE1]: fixture } });
    for (const n of numbersToTap) await finish(h, vm.onItemPress(noti(n)));
    expect(patches(h)).toHaveLength(0);
    expect(h.navigator.calls).toEqual([]);
    expect(h.toasts.messages).toEqual([]);
    expect(vm.state.body.status).toBe('ready');
    expect(itemsOf(vm.state).every((item) => item.readAt === null || item.id === noti(8))).toBe(true);
    expect(h.sync.unreadRefreshes).toBe(0);
  });
});

describe('행 탭: 읽음 실패 분기 (REQ-NOTI-017~019, D-11, D-24)', () => {
  it('TC-NOTI-032 연결 실패면 네트워크 토스트를 띄우고 그래도 이동하며 행은 미읽음으로 남고 미읽음 점은 다시 조회하지 않는다', async () => {
    const { h, vm } = await open({ routes: { [readKey(1)]: failing } });
    await finish(h, vm.onItemPress(noti(1)));
    expect(h.toasts.messages).toEqual([T.network]);
    expect(h.navigator.calls).toEqual([{ type: 'post', postId: SOURCE_POST, openAiReview: false }]);
    expect(itemsOf(vm.state)[0]!.readAt).toBeNull();
    expect(h.sync.unreadRefreshes).toBe(0);
  });

  it('TC-NOTI-032 타임아웃도 연결 실패와 같다(15초 응답 없음)', async () => {
    const never = () => new Promise<Response>(() => undefined);
    const { h, vm } = await open({ routes: { [readKey(1)]: never } });
    const press = vm.onItemPress(noti(1));
    await settle();
    await h.clock.advance(60_000);
    await finish(h, press);
    expect(h.toasts.messages).toEqual([T.network]);
    expect(h.navigator.calls).toHaveLength(1);
    expect(itemsOf(vm.state)[0]!.readAt).toBeNull();
  });

  it('TC-NOTI-033 404면 이동하지 않고 noti.gone 토스트 뒤 목록과 미읽음 점을 다시 불러오며 사라진 항목은 목록에서 빠진다', async () => {
    const { h, vm } = await open({ routes: { [readKey(1)]: 'notification/notification-read__not-found' } });
    h.router.set(PAGE1, () => {
      const body = structuredClone(loadFixture('notification/notifications__page1.json').json) as { notifications: unknown[] };
      return json(200, { ...body, notifications: body.notifications.slice(1) });
    });
    await finish(h, vm.onItemPress(noti(1)));
    expect(h.router.calls(readKey(1))).toHaveLength(1);
    expect(h.toasts.messages).toEqual([T.gone]);
    expect(h.navigator.calls).toEqual([]);
    expect(h.router.calls(PAGE1)).toHaveLength(1); // 목록 다시 불러오기
    expect(h.sync.unreadRefreshes).toBe(1);
    expect(numbers(vm.state)).toEqual(upTo(20, 2));
  });

  it.each([
    ['500', 'notification/notification-read__internal-error'],
    ['403', () => json(403, { errorCode: 'FORBIDDEN', message: '접근 권한이 없습니다.' })],
    ['400', () => json(400, { errorCode: 'BUSINESS_ERROR', message: '잘못된 요청입니다.' })],
  ])('TC-NOTI-034 %s도 404와 같게 처리한다: 이동 없음, noti.gone, 목록·미읽음 새로고침', async (_status, route) => {
    const { h, vm } = await open({ routes: { [readKey(1)]: route } });
    h.router.set(PAGE1, 'notification/notifications__page1'); // 호출 수를 0부터 센다
    await finish(h, vm.onItemPress(noti(1)));
    expect(h.toasts.messages).toEqual([T.gone]);
    expect(h.navigator.calls).toEqual([]);
    expect(h.router.calls(PAGE1)).toHaveLength(1);
    expect(h.sync.unreadRefreshes).toBe(1);
    expect(itemsOf(vm.state)[0]!.readAt).toBeNull();
  });

  it('TC-NOTI-035 401 UNAUTHORIZED는 refresh 뒤 한 번 다시 보내 성공하면 이동한다', async () => {
    const { h, vm } = await open({ routes: { [readKey(1)]: ['notification/notification-read__unauthorized', 'notification/notification-read__no-content'], 'POST /auth/refresh': 'auth/refresh__success' } });
    await finish(h, vm.onItemPress(noti(1)));
    expect(h.router.calls(readKey(1))).toHaveLength(2);
    expect(h.navigator.calls).toEqual([{ type: 'post', postId: SOURCE_POST, openAiReview: false }]);
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-NOTI-035 REAUTHENTICATION_REQUIRED면 세션 만료를 알리고 토스트·이동·목록 새로고침 없이 끝난다', async () => {
    const { h, vm } = await open({ routes: { [readKey(1)]: 'notification/notification-read__unauthorized', 'POST /auth/refresh': 'auth/refresh__reauthentication-required' } });
    h.router.set(PAGE1, 'notification/notifications__page1'); // 호출 수를 0부터 센다
    await finish(h, vm.onItemPress(noti(1)));
    expect(h.expired.count).toBe(1);
    expect(h.toasts.messages).toEqual([]);
    expect(h.navigator.calls).toEqual([]);
    expect(h.router.calls(PAGE1)).toHaveLength(0);
    expect(itemsOf(vm.state)[0]!.readAt).toBeNull();
  });
});

describe('행 탭: 연타와 취소 (REQ-NOTI-020)', () => {
  it('TC-NOTI-038 같은 행을 빠르게 연타해도 읽음 PATCH 1회, 이동 1회다', async () => {
    const gate = deferred<void>();
    const { h, vm } = await open();
    h.router.set(readKey(1), gated(gate, 'notification/notification-read__no-content'));
    const a = vm.onItemPress(noti(1));
    const b = vm.onItemPress(noti(1));
    const c = vm.onItemPress(noti(1));
    await settle();
    gate.resolve();
    await finish(h, Promise.all([a, b, c]));
    expect(h.router.calls(readKey(1))).toHaveLength(1);
    expect(h.navigator.calls).toHaveLength(1);
  });

  it('TC-NOTI-038 처리 중에는 다른 행의 탭도 무시한다(한 번에 하나, 임시 결정). 끝나면 다시 누를 수 있다', async () => {
    const gate = deferred<void>();
    const { h, vm } = await open();
    h.router.set(readKey(1), gated(gate, 'notification/notification-read__no-content'));
    const first = vm.onItemPress(noti(1));
    await settle();
    await vm.onItemPress(noti(2));
    expect(h.router.calls(readKey(2))).toHaveLength(0);
    gate.resolve();
    await finish(h, first);
    await finish(h, vm.onItemPress(noti(2)));
    expect(h.navigator.calls).toEqual([{ type: 'post', postId: SOURCE_POST, openAiReview: false }, { type: 'detail', notificationId: noti(2) }]);
  });

  it('TC-NOTI-038 실패로 끝난 행도 처리 중 표시가 풀려 다시 누를 수 있다', async () => {
    const { h, vm } = await open({ routes: { [readKey(1)]: 'notification/notification-read__not-found' } });
    await finish(h, vm.onItemPress(noti(1)));
    h.router.set(readKey(1), 'notification/notification-read__no-content');
    await finish(h, vm.onItemPress(noti(1)));
    expect(h.navigator.calls).toEqual([{ type: 'post', postId: SOURCE_POST, openAiReview: false }]);
  });

  it('TC-NOTI-039 읽음 요청 중 화면을 떠나면 응답이 와도 이동하지 않고 오류·토스트도 없다', async () => {
    const gate = deferred<void>();
    const { h, vm } = await open();
    h.router.set(readKey(1), gated(gate, 'notification/notification-read__no-content'));
    const press = vm.onItemPress(noti(1));
    await settle();
    vm.onHidden();
    gate.resolve();
    await finish(h, press);
    expect(h.navigator.calls).toEqual([]);
    expect(h.toasts.messages).toEqual([]);
    expect(h.ff.calls.find((c) => c.method === 'PATCH')!.signal?.aborted).toBe(true);
  });

  it('TC-NOTI-039 읽음 요청이 연결 실패로 끝난 뒤 떠났다면 네트워크 토스트도 띄우지 않는다', async () => {
    const gate = deferred<void>();
    const { h, vm } = await open();
    h.router.set(readKey(1), async () => {
      await gate.promise;
      throw new TypeError('Failed to fetch');
    });
    const press = vm.onItemPress(noti(1));
    await settle();
    vm.onHidden();
    gate.resolve();
    await finish(h, press);
    expect(h.toasts.messages).toEqual([]);
    expect(h.navigator.calls).toEqual([]);
  });

  it('TC-NOTI-039 떠났다 돌아오면 다시 누를 수 있다', async () => {
    const gate = deferred<void>();
    const { h, vm } = await open();
    h.router.set(readKey(1), gated(gate, 'notification/notification-read__no-content'));
    const press = vm.onItemPress(noti(1));
    await settle();
    vm.onHidden();
    gate.resolve();
    await finish(h, press);
    await finish(h, vm.onShown());
    await finish(h, vm.onItemPress(noti(1)));
    expect(h.navigator.calls).toEqual([{ type: 'post', postId: SOURCE_POST, openAiReview: false }]);
  });
});

describe('조회는 읽음 처리가 아니다 (TC-NOTI-041)', () => {
  it('TC-NOTI-041 목록 조회·새로고침·다음 페이지·재검증만으로는 PATCH read가 0건이다', async () => {
    const { h, vm } = await open();
    await finish(h, vm.onSentinelVisible());
    await finish(h, vm.refresh());
    vm.onHidden();
    await finish(h, vm.onShown());
    expect(patches(h)).toHaveLength(0);
    expect(h.ff.calls.length).toBeGreaterThan(3);
  });
});
