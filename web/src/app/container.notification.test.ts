import { NotificationDetailViewModel } from '../features/notification/NotificationDetailViewModel';
import { NotificationInboxViewModel } from '../features/notification/NotificationInboxViewModel';
import { NotificationRepository } from '../features/notification/NotificationRepository';
import { makeHarness } from '../test/appHarness';
import { FixtureRouter } from '../test/fixtureRouter';
import { memberSession } from '../test/fixtures';
import { MEMBER_ROUTES, finish } from '../test/homeHarness';
import { FakeNotificationNavigator } from '../test/FakeNotificationNavigator';
import { detailKey, NOTIFICATION_ROUTES, noti, PAGE1, readKey, UNREAD_KEY, upTo, numbers, itemsOf } from '../test/notificationHarness';

const GONE_ID = '33333333-3333-4333-8333-333333333399';

function setup() {
  const h = makeHarness({ session: memberSession() });
  const router = new FixtureRouter(h.ff, { ...MEMBER_ROUTES, ...NOTIFICATION_ROUTES, [detailKey(GONE_ID)]: 'notification/notification-detail__not-found' });
  return { h, router, c: h.container };
}

describe('앱 조립: 알림 (W10)', () => {
  it('notificationRepository는 컨테이너의 ApiClient로 알림함 API를 부른다', async () => {
    const { h, c } = setup();
    expect(c.notificationRepository).toBeInstanceOf(NotificationRepository);
    const page = await finish(h, c.notificationRepository.fetchPage(1));
    expect(page.notifications).toHaveLength(20);
    expect(h.ff.calls[0]!.headers['authorization']).toBe('Bearer fixture-access-token-1');
  });

  it('inboxSession은 하나를 보관해 같은 ViewModel을 돌려준다(상세에 갔다 와도 목록이 남는다)', async () => {
    const { h, c } = setup();
    const first = c.inboxSession();
    expect(first.viewModel).toBeInstanceOf(NotificationInboxViewModel);
    await finish(h, first.viewModel.onShown());
    const again = c.inboxSession();
    expect(again).toBe(first);
    expect(numbers(again.viewModel.state)).toEqual(upTo(20));
  });

  it('createNotificationDetailViewModel은 호출마다 새 ViewModel을 만든다', async () => {
    const { h, c } = setup();
    const a = c.createNotificationDetailViewModel({ notificationId: noti(2) });
    const b = c.createNotificationDetailViewModel({ notificationId: noti(2) });
    expect(a).toBeInstanceOf(NotificationDetailViewModel);
    await finish(h, a.load());
    expect(a.state.body.status).toBe('ready');
    expect(b.state.body).toEqual({ status: 'loading' });
    expect(a).not.toBe(b);
  });

  it('inboxSession의 이동 통로는 화면이 꽂은 구현으로 전달된다', async () => {
    const { h, c } = setup();
    const { viewModel, navigator } = c.inboxSession();
    const fake = new FakeNotificationNavigator();
    navigator.attach(fake);
    await finish(h, viewModel.onShown());
    await finish(h, viewModel.onItemPress(noti(2)));
    expect(fake.calls).toEqual([{ type: 'detail', notificationId: noti(2) }]);
  });

  it('TC-NOTI-053 userCaches.clearAll은 알림함 ViewModel을 처음 상태로 돌린다', async () => {
    const { h, c } = setup();
    const { viewModel } = c.inboxSession();
    await finish(h, viewModel.onShown());
    expect(numbers(viewModel.state)).toEqual(upTo(20));
    await c.userCaches.clearAll();
    expect(viewModel.state.body).toEqual({ status: 'loading' });
  });

  it('TC-NOTI-050 읽음 성공은 홈 ViewModel의 미읽음 조회(refreshUnread)를 한 번 부른다', async () => {
    const { h, router, c } = setup();
    await finish(h, c.homeSession('member').viewModel.refreshUnread());
    const before = router.calls(UNREAD_KEY).length;
    const { viewModel, navigator } = c.inboxSession();
    navigator.attach(new FakeNotificationNavigator());
    await finish(h, viewModel.onShown());
    await finish(h, viewModel.onItemPress(noti(1)));
    expect(router.calls(readKey(1))).toHaveLength(1);
    await finish(h, Promise.resolve());
    expect(router.calls(UNREAD_KEY).length).toBe(before + 1);
  });

  it('홈 ViewModel이 아직 없으면 읽음 성공 뒤 미읽음 조회가 없고 오류도 없다(직접 진입)', async () => {
    const { h, router, c } = setup();
    const { viewModel, navigator } = c.inboxSession();
    navigator.attach(new FakeNotificationNavigator());
    await finish(h, viewModel.onShown());
    await finish(h, viewModel.onItemPress(noti(1)));
    await finish(h, Promise.resolve());
    expect(router.calls(UNREAD_KEY)).toHaveLength(0);
    expect(itemsOf(viewModel.state)[0]!.readAt).not.toBeNull();
  });

  it('TC-NOTI-045 상세가 404면 알림함 ViewModel의 재검증과 홈 미읽음 조회가 한 번씩 일어난다', async () => {
    const { h, router, c } = setup();
    const { viewModel } = c.inboxSession();
    await finish(h, viewModel.onShown());
    await finish(h, c.homeSession('member').viewModel.refreshUnread());
    const unreadBefore = router.calls(UNREAD_KEY).length;
    const listBefore = router.calls(PAGE1).length;
    const detail = c.createNotificationDetailViewModel({ notificationId: GONE_ID });
    await finish(h, detail.load());
    await finish(h, Promise.resolve());
    expect(detail.state.body).toEqual({ status: 'gone' });
    expect(router.calls(PAGE1).length).toBe(listBefore + 1);
    expect(router.calls(UNREAD_KEY).length).toBe(unreadBefore + 1);
  });

  it('알림함이 만들어지기 전에 상세가 404여도 오류 없이 상태만 gone이 된다', async () => {
    const { h, c } = setup();
    const detail = c.createNotificationDetailViewModel({ notificationId: GONE_ID });
    await finish(h, detail.load());
    expect(detail.state.body).toEqual({ status: 'gone' });
  });
});
