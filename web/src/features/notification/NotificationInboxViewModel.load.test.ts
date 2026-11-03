import { deferred } from '../../test/deferred';
import { gated } from '../../test/displayAsserts';
import { json } from '../../test/fixtureRouter';
import { loadFixture } from '../../test/fixtures';
import { createNotificationHarness, finish, itemsOf, noti, numbers, PAGE1, PAGE2, readKey, settle, upTo } from '../../test/notificationHarness';
import type { NotificationHarness } from '../../test/notificationHarness';
import type { InboxState } from './NotificationInboxViewModel';

const T = {
  moreError: '다음 알림을 불러오지 못했어요. 다시 시도해 주세요.',
  refreshError: '알림을 새로고침하지 못했어요. 다시 시도해 주세요.',
};

const page1Body = () => structuredClone(loadFixture('notification/notifications__page1.json').json) as { hasNext: boolean; notifications: Record<string, unknown>[] };
/** page1에서 앞의 n건만 남긴 응답(hasNext 지정). */
const firstN = (n: number, hasNext = false) => () => {
  const body = page1Body();
  return json(200, { ...body, hasNext, notifications: body.notifications.slice(0, n) });
};
const failing = () => {
  throw new TypeError('Failed to fetch');
};
const ready = (vm: { state: InboxState }) => {
  if (vm.state.body.status !== 'ready') throw new Error(`body is ${vm.state.body.status}`);
  return vm.state.body;
};

/** 알림함을 열고 1·2페이지를 모두 읽는다(25건, hasNext=false). */
async function openAll(h: NotificationHarness) {
  const vm = await h.openInbox();
  await finish(h, vm.onLastVisibleIndexChanged(16));
  return vm;
}

describe('첫 로딩 (REQ-NOTI-001, 002, 008, 009)', () => {
  it('TC-NOTI-004 응답 전에는 loading이고 읽히면 서버 순서 그대로 20건 ready다', async () => {
    const gate = deferred<void>();
    const h = createNotificationHarness({ routes: { [PAGE1]: gated(gate, 'notification/notifications__page1') } });
    const vm = h.inbox();
    const shown = vm.onShown();
    await settle();
    expect(vm.state.body).toEqual({ status: 'loading' });
    gate.resolve();
    await finish(h, shown);
    expect(numbers(vm.state)).toEqual(upTo(20));
    expect(ready(vm).hasNext).toBe(true);
    expect(vm.state).toMatchObject({ refreshing: false, paging: false, pageFailures: 0 });
    expect(h.router.calls(PAGE1)).toHaveLength(1);
  });

  it('TC-NOTI-005 0건이면 empty다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: 'notification/notifications__empty' } });
    const vm = await h.openInbox();
    expect(vm.state.body).toEqual({ status: 'empty' });
  });

  it('TC-NOTI-006 500이면 오류 화면(network:false)이고 다시 시도가 같은 첫 페이지를 다시 읽는다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: 'notification/notifications__internal-error' } });
    const vm = await h.openInbox();
    expect(vm.state.body).toEqual({ status: 'error', network: false });
    expect(h.toasts.messages).toEqual([]);
    h.router.set(PAGE1, 'notification/notifications__page1');
    const retry = vm.retry();
    expect(vm.state.body).toEqual({ status: 'loading' });
    await finish(h, retry);
    expect(numbers(vm.state)).toEqual(upTo(20));
    expect(h.router.calls(PAGE1)).toHaveLength(1);
  });

  it('TC-NOTI-007 연결 실패면 오류 화면의 network가 true다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: failing } });
    const vm = await h.openInbox();
    expect(vm.state.body).toEqual({ status: 'error', network: true });
  });

  it('TC-NOTI-008 계약 위반(필수 필드 누락)이면 크래시 없이 network:false 오류 화면이다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: 'notification/notifications__missing-fields' } });
    const vm = await h.openInbox();
    expect(vm.state.body).toEqual({ status: 'error', network: false });
  });

  it('TC-NOTI-010 목록 404(방어용)는 noti.gone 토스트도 자동 재요청도 없이 일반 오류 화면이다(임시 결정)', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: 'notification/notifications__not-found' } });
    const vm = await h.openInbox();
    expect(vm.state.body).toEqual({ status: 'error', network: false });
    expect(h.toasts.messages).toEqual([]);
    expect(h.router.calls(PAGE1)).toHaveLength(1);
  });

  it('TC-NOTI-009 401 UNAUTHORIZED는 refresh 뒤 한 번 다시 받아 ready가 된다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: ['notification/notifications__unauthorized', 'notification/notifications__page1'], 'POST /auth/refresh': 'auth/refresh__success' } });
    const vm = await h.openInbox();
    expect(numbers(vm.state)).toEqual(upTo(20));
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-NOTI-009 REAUTHENTICATION_REQUIRED면 세션 만료를 알리고 토스트·오류 화면 없이 상태를 그대로 둔다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: 'notification/notifications__unauthorized', 'POST /auth/refresh': 'auth/refresh__reauthentication-required' } });
    const vm = await h.openInbox();
    expect(h.expired.count).toBe(1);
    expect(h.toasts.messages).toEqual([]);
    expect(vm.state.body).toEqual({ status: 'loading' });
  });

  it('TC-NOTI-023 서버가 준 항목은 날짜로 거르지 않고 모두 보여 준다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: 'notification/notifications__30day-boundary' } });
    const vm = await h.openInbox();
    expect(numbers(vm.state)).toEqual([1, 2]);
  });

  it('TC-NOTI-024 알 수 없는 type 항목도 목록에 남는다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: 'notification/notifications__unknown-type' } });
    const vm = await h.openInbox();
    expect(itemsOf(vm.state)).toHaveLength(1);
  });

  it('REQ-NOTI-013 모두 읽음 API(PATCH /notifications/read-all)는 부르지 않는다', async () => {
    const h = createNotificationHarness();
    const vm = await openAll(h);
    await finish(h, vm.refresh());
    expect(h.ff.calls.filter((c) => c.path.endsWith('/read-all') || (c.method === 'PATCH' && !c.path.endsWith('/read')))).toHaveLength(0);
  });

  it('TC-NOTI-022 첫 로딩 중 화면을 떠나면 요청을 취소하고 오류 토스트·오류 화면이 없다', async () => {
    const gate = deferred<void>();
    const h = createNotificationHarness({ routes: { [PAGE1]: gated(gate, 'notification/notifications__page1') } });
    const vm = h.inbox();
    const shown = vm.onShown();
    await settle();
    vm.onHidden();
    await settle();
    expect(h.ff.calls[0]!.signal?.aborted).toBe(true);
    gate.resolve();
    await finish(h, shown);
    expect(h.toasts.messages).toEqual([]);
    expect(vm.state.body).toEqual({ status: 'loading' });
    // 다시 보이면 처음부터 읽는다.
    h.router.set(PAGE1, 'notification/notifications__page1');
    await finish(h, vm.onShown());
    expect(numbers(vm.state)).toEqual(upTo(20));
  });
});

describe('다음 페이지 (REQ-NOTI-005, 006, 007, 011)', () => {
  it('TC-NOTI-015 끝에서 4번째(index >= length-4)에 닿으면 page=2를 한 번만 요청하고 같은 위치에서 계속 불러도 중복 요청이 없다', async () => {
    const gate = deferred<void>();
    const h = createNotificationHarness();
    const vm = await h.openInbox();
    await vm.onLastVisibleIndexChanged(15); // 아직 멀다
    expect(h.router.calls(PAGE2)).toHaveLength(0);
    h.router.set(PAGE2, gated(gate, 'notification/notifications__page2-last'));
    const first = vm.onLastVisibleIndexChanged(16);
    await settle();
    expect(vm.state.paging).toBe(true);
    await vm.onLastVisibleIndexChanged(17);
    await vm.onLastVisibleIndexChanged(19);
    await vm.onSentinelVisible();
    expect(h.router.calls(PAGE2)).toHaveLength(1);
    expect(h.router.calls(PAGE2)[0]!.query.get('page')).toBe('2');
    gate.resolve();
    await finish(h, first);
    expect(vm.state.paging).toBe(false);
    expect(numbers(vm.state)).toEqual(upTo(25));
    await vm.onLastVisibleIndexChanged(24);
    expect(h.router.calls(PAGE2)).toHaveLength(1);
  });

  it('TC-NOTI-016 hasNext=false면 끝까지 스크롤해도 추가 요청이 0건이다', async () => {
    const h = createNotificationHarness();
    const vm = await openAll(h);
    expect(ready(vm).hasNext).toBe(false);
    const before = h.ff.calls.length;
    await vm.onSentinelVisible();
    await vm.onLastVisibleIndexChanged(24);
    expect(h.ff.calls).toHaveLength(before);
  });

  it('TC-NOTI-016 처음부터 hasNext=false인 목록은 센티넬이 보여도 요청하지 않는다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: firstN(3) } });
    const vm = await h.openInbox();
    await vm.onLastVisibleIndexChanged(2);
    await vm.onSentinelVisible();
    expect(h.ff.calls).toHaveLength(1);
  });

  it('TC-NOTI-017 2페이지에 1페이지와 같은 id가 있으면 중복을 제거하고 순서를 유지한다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE2]: 'notification/notifications__overlap-page2' } });
    const vm = await h.openInbox();
    await finish(h, vm.onSentinelVisible());
    expect(numbers(vm.state)).toEqual([...upTo(20), 26, 27, 28]);
  });

  it('TC-NOTI-018 다음 페이지가 실패하면 목록·페이지 번호를 유지하고 토스트를 띄우며 다시 불러오면 같은 page=2를 요청한다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE2]: 'notification/notifications__internal-error' } });
    const vm = await h.openInbox();
    await finish(h, vm.onSentinelVisible());
    expect(h.toasts.messages).toEqual([T.moreError]);
    expect(numbers(vm.state)).toEqual(upTo(20));
    expect(vm.state).toMatchObject({ paging: false, pageFailures: 1 });
    expect(ready(vm).hasNext).toBe(true);

    h.router.set(PAGE2, 'notification/notifications__page2-last');
    await finish(h, vm.onSentinelVisible());
    expect(h.router.calls(PAGE2)).toHaveLength(1);
    expect(h.router.calls(PAGE2)[0]!.query.get('page')).toBe('2');
    expect(numbers(vm.state)).toEqual(upTo(25));
    expect(h.toasts.messages).toEqual([T.moreError]);
  });

  it('TC-NOTI-018 다음 페이지 연결 실패도 같은 토스트이고 실패를 거듭하면 pageFailures가 늘어난다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE2]: failing } });
    const vm = await h.openInbox();
    await finish(h, vm.onSentinelVisible());
    await finish(h, vm.onSentinelVisible());
    expect(h.toasts.messages).toEqual([T.moreError, T.moreError]);
    expect(vm.state.pageFailures).toBe(2);
    expect(numbers(vm.state)).toEqual(upTo(20));
  });

  it('TC-NOTI-022 다음 페이지 요청 중 화면을 떠나면 오류 토스트가 없고 목록은 그대로다', async () => {
    const gate = deferred<void>();
    const h = createNotificationHarness();
    const vm = await h.openInbox();
    h.router.set(PAGE2, gated(gate, 'notification/notifications__page2-last'));
    const more = vm.onSentinelVisible();
    await settle();
    vm.onHidden();
    gate.resolve();
    await finish(h, more);
    expect(h.toasts.messages).toEqual([]);
    expect(numbers(vm.state)).toEqual(upTo(20));
    expect(vm.state.paging).toBe(false);
  });

  it('TC-NOTI-023 REQ-NOTI-007 같은 id가 여러 번 와도 한 번만 보인다(2페이지가 전부 중복이면 목록이 늘지 않는다)', async () => {
    const h = createNotificationHarness({ routes: { [PAGE2]: firstN(5) } });
    const vm = await h.openInbox();
    await finish(h, vm.onSentinelVisible());
    expect(numbers(vm.state)).toEqual(upTo(20));
  });
});

describe('당겨서 새로고침 (REQ-NOTI-010)', () => {
  it('TC-NOTI-019 성공하면 목록이 교체되고 페이지가 1로 돌아가 다음 요청은 다시 page=2다', async () => {
    const h = createNotificationHarness();
    const vm = await openAll(h);
    expect(numbers(vm.state)).toEqual(upTo(25));
    const refresh = vm.refresh();
    await settle();
    expect(vm.state.refreshing).toBe(true);
    expect(numbers(vm.state)).toEqual(upTo(25)); // 끝날 때까지 기존 목록 유지
    await finish(h, refresh);
    expect(vm.state.refreshing).toBe(false);
    expect(numbers(vm.state)).toEqual(upTo(20));
    expect(ready(vm).hasNext).toBe(true);
    h.router.set(PAGE2, 'notification/notifications__page2-last');
    await finish(h, vm.onSentinelVisible());
    expect(h.router.calls(PAGE2)).toHaveLength(1);
    expect(numbers(vm.state)).toEqual(upTo(25));
  });

  it('TC-NOTI-019 목록이 비어 있어도 새로고침으로 다시 받을 수 있다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: 'notification/notifications__empty' } });
    const vm = await h.openInbox();
    h.router.set(PAGE1, 'notification/notifications__page1');
    await finish(h, vm.refresh());
    expect(numbers(vm.state)).toEqual(upTo(20));
  });

  it('TC-NOTI-020 실패하면 기존 목록을 유지하고 새로고침 실패 토스트만 띄운다(5xx·연결 실패 모두)', async () => {
    const h = createNotificationHarness();
    const vm = await h.openInbox();
    h.router.set(PAGE1, 'notification/notifications__internal-error');
    await finish(h, vm.refresh());
    expect(h.toasts.messages).toEqual([T.refreshError]);
    expect(numbers(vm.state)).toEqual(upTo(20));
    expect(vm.state.refreshing).toBe(false);
    expect(vm.state.body.status).toBe('ready');
    h.router.set(PAGE1, failing);
    await finish(h, vm.refresh());
    expect(h.toasts.messages).toEqual([T.refreshError, T.refreshError]);
  });

  it('TC-NOTI-020 빈 목록에서 새로고침이 실패해도 빈 상태를 유지하고 토스트를 띄운다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: 'notification/notifications__empty' } });
    const vm = await h.openInbox();
    h.router.set(PAGE1, 'notification/notifications__internal-error');
    await finish(h, vm.refresh());
    expect(vm.state.body).toEqual({ status: 'empty' });
    expect(h.toasts.messages).toEqual([T.refreshError]);
  });

  it('TC-NOTI-021 새로고침이 겹치면 늦게 끝난 이전 응답은 버려지고 다음 페이지 기준은 최신 응답이다', async () => {
    const older = deferred<void>();
    const h = createNotificationHarness();
    const vm = await h.openInbox();
    h.router.set(PAGE1, (_req, index) => (index === 0 ? gated(older, 'notification/notifications__page1')() : firstN(3, false)()));
    const first = vm.refresh();
    await settle();
    const second = vm.refresh();
    await finish(h, second);
    expect(numbers(vm.state)).toEqual([1, 2, 3]);
    older.resolve();
    await finish(h, first);
    expect(numbers(vm.state)).toEqual([1, 2, 3]);
    expect(ready(vm).hasNext).toBe(false);
    expect(vm.state.refreshing).toBe(false);
    const before = h.ff.calls.length;
    await vm.onSentinelVisible();
    expect(h.ff.calls).toHaveLength(before); // 최신 응답은 hasNext=false
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-NOTI-021 진행 중이던 다음 페이지 응답은 새로고침이 시작되면 버려진다', async () => {
    const gate = deferred<void>();
    const h = createNotificationHarness();
    const vm = await h.openInbox();
    h.router.set(PAGE2, gated(gate, 'notification/notifications__page2-last'));
    const more = vm.onSentinelVisible();
    await settle();
    await finish(h, vm.refresh());
    expect(vm.state.paging).toBe(false);
    gate.resolve();
    await finish(h, more);
    expect(numbers(vm.state)).toEqual(upTo(20));
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-NOTI-022 새로고침 중 화면을 떠나면 오류 토스트가 없고 refreshing이 풀린다', async () => {
    const gate = deferred<void>();
    const h = createNotificationHarness();
    const vm = await h.openInbox();
    h.router.set(PAGE1, gated(gate, 'notification/notifications__internal-error'));
    const refresh = vm.refresh();
    await settle();
    vm.onHidden();
    gate.resolve();
    await finish(h, refresh);
    expect(h.toasts.messages).toEqual([]);
    expect(vm.state.refreshing).toBe(false);
    expect(numbers(vm.state)).toEqual(upTo(20));
  });
});

describe('조용한 재검증 (REQ-NOTI-012)', () => {
  /** page1에서 앞 n건을 읽음 처리한 응답. */
  const readFirst = (n: number) => () => {
    const body = page1Body();
    body.notifications.forEach((item, i) => {
      if (i < n) item['readAt'] = '2026-10-27T02:00:00Z';
    });
    return json(200, body);
  };
  const unreadCount = (vm: { state: InboxState }) => itemsOf(vm.state).filter((item) => item.readAt === null).length;

  it('다시 보일 때(onShown) 화면을 비우거나 새로고침 표시 없이 첫 페이지의 읽음 상태를 반영하고 뒤쪽 페이지는 유지한다', async () => {
    const h = createNotificationHarness();
    const vm = await openAll(h);
    expect(unreadCount(vm)).toBe(5);
    vm.onHidden();
    h.router.set(PAGE1, readFirst(5));
    const seen: string[] = [];
    vm.subscribe(() => seen.push(`${vm.state.body.status}/${vm.state.refreshing}`));
    await finish(h, vm.onShown());
    expect(h.router.calls(PAGE1)).toHaveLength(1);
    expect(h.router.calls(PAGE2)).toHaveLength(0);
    expect(unreadCount(vm)).toBe(0);
    expect(numbers(vm.state)).toEqual(upTo(25));
    expect(ready(vm).hasNext).toBe(false);
    expect(seen.every((entry) => entry === 'ready/false')).toBe(true);
    expect(h.toasts.messages).toEqual([]);
  });

  it('재검증이 실패해도 기존 목록을 유지하고 토스트를 띄우지 않는다', async () => {
    const h = createNotificationHarness();
    const vm = await openAll(h);
    vm.onHidden();
    h.router.set(PAGE1, 'notification/notifications__internal-error');
    await finish(h, vm.onShown());
    expect(h.toasts.messages).toEqual([]);
    expect(numbers(vm.state)).toEqual(upTo(25));
    h.router.set(PAGE1, failing);
    await finish(h, vm.revalidate());
    expect(h.toasts.messages).toEqual([]);
    expect(vm.state.body.status).toBe('ready');
  });

  it('빈 목록을 다시 볼 때 새 항목이 생겼으면 ready가 된다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: 'notification/notifications__empty' } });
    const vm = await h.openInbox();
    vm.onHidden();
    h.router.set(PAGE1, firstN(2));
    await finish(h, vm.onShown());
    expect(numbers(vm.state)).toEqual([1, 2]);
  });

  it('오류 화면에서 다시 보이면 처음부터 다시 읽는다(loading을 거친다)', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: 'notification/notifications__internal-error' } });
    const vm = await h.openInbox();
    vm.onHidden();
    h.router.set(PAGE1, 'notification/notifications__page1');
    const shown = vm.onShown();
    expect(vm.state.body).toEqual({ status: 'loading' });
    await finish(h, shown);
    expect(numbers(vm.state)).toEqual(upTo(20));
  });

  it('revalidate는 로딩·오류 상태에서는 아무 일도 하지 않는다', async () => {
    const h = createNotificationHarness({ routes: { [PAGE1]: 'notification/notifications__internal-error' } });
    const vm = await h.openInbox();
    const before = h.ff.calls.length;
    await vm.revalidate();
    expect(h.ff.calls).toHaveLength(before);
    expect(vm.state.body).toEqual({ status: 'error', network: false });
  });

  it('재검증 응답에 없는 첫 페이지 항목은 사라진다(서버가 지운 알림)', async () => {
    const h = createNotificationHarness();
    const vm = await h.openInbox();
    h.router.set(PAGE1, () => {
      const body = page1Body();
      return json(200, { ...body, notifications: body.notifications.filter((_, i) => i !== 0) });
    });
    await finish(h, vm.revalidate());
    expect(numbers(vm.state)).toEqual(upTo(20, 2));
  });
});

describe('계정 전환 (TC-NOTI-040, 053)', () => {
  it('TC-NOTI-053 resetForAccountChange는 목록·페이지를 버리고 처음 상태로 돌린다', async () => {
    const h = createNotificationHarness();
    const vm = await openAll(h);
    vm.resetForAccountChange();
    expect(vm.state).toMatchObject({ body: { status: 'loading' }, refreshing: false, paging: false, pageFailures: 0 });
    await finish(h, vm.onShown());
    expect(numbers(vm.state)).toEqual(upTo(20)); // 새 계정 기준으로 처음부터
    expect(h.router.calls(PAGE2)).toHaveLength(0);
  });

  it('TC-NOTI-053 이전 계정의 늦은 첫 페이지 응답은 반영되지 않는다', async () => {
    const gate = deferred<void>();
    const h = createNotificationHarness({ routes: { [PAGE1]: gated(gate, 'notification/notifications__page1') } });
    const vm = h.inbox();
    const shown = vm.onShown();
    await settle();
    vm.resetForAccountChange();
    gate.resolve();
    await finish(h, shown);
    expect(vm.state.body).toEqual({ status: 'loading' });
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-NOTI-053 이전 계정의 늦은 다음 페이지·새로고침 응답도 반영되지 않는다', async () => {
    const gate = deferred<void>();
    const h = createNotificationHarness();
    const vm = await h.openInbox();
    h.router.set(PAGE2, gated(gate, 'notification/notifications__page2-last'));
    const more = vm.onSentinelVisible();
    await settle();
    vm.resetForAccountChange();
    h.router.set(PAGE1, 'notification/notifications__empty');
    await finish(h, vm.onShown());
    gate.resolve();
    await finish(h, more);
    expect(vm.state.body).toEqual({ status: 'empty' });
    expect(vm.state.paging).toBe(false);
  });

  it('TC-NOTI-040 이전 계정의 읽음 요청이 끝나도 새 목록에 반영하지 않고 이동하지 않는다', async () => {
    const gate = deferred<void>();
    const h = createNotificationHarness();
    const vm = await h.openInbox();
    h.router.set(readKey(1), gated(gate, 'notification/notification-read__no-content'));
    const press = vm.onItemPress(noti(1));
    await settle();
    vm.resetForAccountChange();
    gate.resolve();
    await finish(h, press);
    expect(h.navigator.calls).toEqual([]);
    expect(h.toasts.messages).toEqual([]);
    expect(h.sync.unreadRefreshes).toBe(0);
    expect(vm.state.body).toEqual({ status: 'loading' });
  });
});
