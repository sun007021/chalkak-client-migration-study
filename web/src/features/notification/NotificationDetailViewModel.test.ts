import { deferred } from '../../test/deferred';
import { gated } from '../../test/displayAsserts';
import { createNotificationHarness, detailKey, finish, noti, settle } from '../../test/notificationHarness';

const failing = () => {
  throw new TypeError('Failed to fetch');
};
const GONE_ID = '33333333-3333-4333-8333-333333333399';
const patches = (h: ReturnType<typeof createNotificationHarness>) => h.ff.calls.filter((c) => c.method === 'PATCH');

describe('알림 상세 불러오기 (REQ-NOTI-023, 027)', () => {
  it('TC-NOTI-042 응답 전에는 loading이고 읽히면 상세(반려: 사진·사유)가 ready다', async () => {
    const gate = deferred<void>();
    const h = createNotificationHarness({ routes: { [detailKey(2)]: gated(gate, 'notification/notification-detail__rejected') } });
    const vm = h.detail(noti(2));
    const load = vm.load();
    await settle();
    expect(vm.state.body).toEqual({ status: 'loading' });
    gate.resolve();
    await finish(h, load);
    expect(vm.state.body).toMatchObject({ status: 'ready', detail: { id: noti(2), type: 'POST_REJECTED', rejectionReason: expect.stringContaining('얼굴') } });
    expect(h.router.calls(detailKey(2))).toHaveLength(1);
  });

  it('TC-NOTI-041 조회만으로 읽음 처리하지 않는다: 상세 로드·재시도에서 PATCH read가 0건이다', async () => {
    const h = createNotificationHarness();
    const vm = h.detail(noti(2));
    await finish(h, vm.load());
    expect(patches(h)).toHaveLength(0);
    expect(h.sync.unreadRefreshes).toBe(0);
    expect(h.sync.inboxRefreshes).toBe(0);
  });

  it('TC-NOTI-044 공지 상세는 사진·사유가 null이다', async () => {
    const h = createNotificationHarness();
    const vm = h.detail(noti(5));
    await finish(h, vm.load());
    expect(vm.state.body).toMatchObject({ status: 'ready', detail: { type: 'NOTICE', originalImageUrl: null, rejectionReason: null } });
  });

  it('TC-NOTI-045 404면 gone이고 알림함·미읽음을 한 번씩 새로고침하며 이전 알림 정보를 담지 않는다', async () => {
    const h = createNotificationHarness({ routes: { [detailKey(GONE_ID)]: 'notification/notification-detail__not-found' } });
    const vm = h.detail(GONE_ID);
    await finish(h, vm.load());
    expect(vm.state.body).toEqual({ status: 'gone' });
    expect(h.sync.inboxRefreshes).toBe(1);
    expect(h.sync.unreadRefreshes).toBe(1);
    expect(h.toasts.messages).toEqual([]);
    expect(h.ff.calls).toHaveLength(1); // 재시도 없음
  });

  it('TC-NOTI-046 500이면 오류 상태(network:false)이고 다시 시도하면 loading을 거쳐 같은 상세를 다시 요청한다', async () => {
    const h = createNotificationHarness({ routes: { [detailKey(2)]: 'notification/notification-detail__internal-error' } });
    const vm = h.detail(noti(2));
    await finish(h, vm.load());
    expect(vm.state.body).toEqual({ status: 'error', network: false });
    expect(h.sync.inboxRefreshes).toBe(0);
    h.router.set(detailKey(2), 'notification/notification-detail__rejected');
    const retry = vm.retry();
    expect(vm.state.body).toEqual({ status: 'loading' });
    await finish(h, retry);
    expect(vm.state.body.status).toBe('ready');
    expect(h.router.calls(detailKey(2))).toHaveLength(1);
  });

  it('TC-NOTI-046 연결 실패면 network:true 오류 상태이고 다시 시도로 복구한다', async () => {
    const h = createNotificationHarness({ routes: { [detailKey(2)]: failing } });
    const vm = h.detail(noti(2));
    await finish(h, vm.load());
    expect(vm.state.body).toEqual({ status: 'error', network: true });
    h.router.set(detailKey(2), 'notification/notification-detail__rejected');
    await finish(h, vm.retry());
    expect(vm.state.body.status).toBe('ready');
  });

  it('TC-NOTI-046 계약 위반(해석 불가)은 network:false 오류 상태다', async () => {
    const h = createNotificationHarness({ routes: { [detailKey(2)]: () => new Response('{', { status: 200, headers: { 'content-type': 'application/json' } }) } });
    const vm = h.detail(noti(2));
    await finish(h, vm.load());
    expect(vm.state.body).toEqual({ status: 'error', network: false });
  });

  it('오류 상태가 아닐 때의 retry는 아무 일도 하지 않는다', async () => {
    const h = createNotificationHarness();
    const vm = h.detail(noti(2));
    await finish(h, vm.load());
    await vm.retry();
    expect(h.router.calls(detailKey(2))).toHaveLength(1);
    expect(vm.state.body.status).toBe('ready');
  });

  it('TC-NOTI-055 401 REAUTHENTICATION_REQUIRED면 세션 만료를 알리고 오류 화면 없이 상태를 그대로 둔다', async () => {
    const h = createNotificationHarness({ routes: { [detailKey(2)]: 'notification/notifications__unauthorized', 'POST /auth/refresh': 'auth/refresh__reauthentication-required' } });
    const vm = h.detail(noti(2));
    await finish(h, vm.load());
    expect(h.expired.count).toBe(1);
    expect(vm.state.body).toEqual({ status: 'loading' });
  });

  it('TC-NOTI-022 화면을 떠나(dispose) 응답이 늦게 와도 상태도 새로고침도 건드리지 않고 요청은 취소된다', async () => {
    const gate = deferred<void>();
    const h = createNotificationHarness({ routes: { [detailKey(GONE_ID)]: async () => { await gate.promise; return new Response(JSON.stringify({ errorCode: 'BUSINESS_ERROR', message: 'x' }), { status: 404, headers: { 'content-type': 'application/json' } }); } } });
    const vm = h.detail(GONE_ID);
    const load = vm.load();
    await settle();
    vm.dispose();
    expect(h.ff.calls[0]!.signal?.aborted).toBe(true);
    gate.resolve();
    await finish(h, load);
    expect(vm.state.body).toEqual({ status: 'loading' });
    expect(h.sync.inboxRefreshes).toBe(0);
    expect(h.sync.unreadRefreshes).toBe(0);
  });
});
