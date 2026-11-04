import type { StoredSession } from '../core/auth/SessionStore';
import { ToastController } from '../core/ui/ToastController';
import { NotificationDetailViewModel } from '../features/notification/NotificationDetailViewModel';
import { NotificationInboxViewModel } from '../features/notification/NotificationInboxViewModel';
import type { InboxState } from '../features/notification/NotificationInboxViewModel';
import { NotificationRepository } from '../features/notification/NotificationRepository';
import { makeApiEnv } from './apiEnv';
import { FakeNotificationNavigator } from './FakeNotificationNavigator';
import { FakeNotificationSync } from './FakeNotificationSync';
import { FixtureRouter } from './fixtureRouter';
import type { RouteValue } from './fixtureRouter';
import { memberSession } from './fixtures';
import { finish, settle } from './homeHarness';
import { SequentialIdGenerator } from './sequentialIds';
import { recordToasts } from './toastLog';

export { finish, settle };

/** 알림 fixture의 id는 `3333…33NN`(NN=01~28)이다. */
export const noti = (n: number): string => `33333333-3333-4333-8333-3333333333${String(n).padStart(2, '0')}`;
/** 알림 fixture가 가리키는 게시물(내 게시물). */
export const SOURCE_POST = '22222222-2222-4222-8222-222222222201';

export const pageKey = (page: number): string => `GET /notifications?page=${page}&pageSize=20`;
export const PAGE1 = pageKey(1);
export const PAGE2 = pageKey(2);
export const UNREAD_KEY = 'GET /notifications/unread-status';
export const detailKey = (n: number | string): string => `GET /notifications/${typeof n === 'number' ? noti(n) : n}`;
export const readKey = (n: number | string): string => `PATCH /notifications/${typeof n === 'number' ? noti(n) : n}/read`;

export const READ_OK = 'notification/notification-read__no-content';

/** 읽음 PATCH는 id마다 경로가 달라 알림 번호 범위 전체에 같은 응답을 깐다. */
export function readRoutes(fixture: string = READ_OK, from = 1, to = 40): Record<string, RouteValue> {
  return Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [readKey(from + i), fixture]));
}

/** 알림함 성공 경로 기본 라우트: 1·2페이지, 미읽음 없음, 모든 알림의 읽음 204, 대표 상세. 테스트가 필요한 키만 router.set으로 바꾼다. */
export const NOTIFICATION_ROUTES: Record<string, RouteValue> = {
  [PAGE1]: 'notification/notifications__page1',
  [PAGE2]: 'notification/notifications__page2-last',
  [UNREAD_KEY]: 'notification/unread-status__false',
  [detailKey(1)]: 'notification/notification-detail__approved',
  [detailKey(2)]: 'notification/notification-detail__rejected',
  [detailKey(5)]: 'notification/notification-detail__notice',
  [detailKey(7)]: 'notification/notification-detail__rejected-long-reason',
  ...readRoutes(),
};

export interface NotificationHarnessOptions {
  session?: StoredSession;
  /** 기본 라우트 위에 덮어쓸 라우트. */
  routes?: Record<string, RouteValue>;
  /** true면 기본 라우트를 깔지 않는다(라우트에 없는 요청은 연결 실패로 거절되고 기록에 남는다). */
  bare?: boolean;
}

/**
 * ViewModel 단위 테스트용: 실제 NotificationRepository·ApiClient를 FakeFetch(FixtureRouter) 위에 엮고,
 * 이동(navigator)과 다른 화면 갱신(sync)은 Fake로 기록한다. inbox()/detail()로 ViewModel을 만든다.
 */
export function createNotificationHarness(options: NotificationHarnessOptions = {}) {
  const env = makeApiEnv(options.session ?? memberSession());
  const router = new FixtureRouter(env.ff, { ...(options.bare ? {} : NOTIFICATION_ROUTES), ...options.routes });
  const api = env.client();
  const toast = new ToastController({ clock: env.clock, ids: new SequentialIdGenerator() });
  const toasts = recordToasts(toast);
  const repository = new NotificationRepository({ api });
  const navigator = new FakeNotificationNavigator();
  const sync = new FakeNotificationSync();

  const inbox = () => new NotificationInboxViewModel({ repository, toast, navigator, sync, clock: env.clock });
  const detail = (notificationId: string) => new NotificationDetailViewModel({ notificationId, repository, sync });
  /** 알림함을 만들고 첫 페이지를 끝까지 읽는다. */
  const openInbox = async () => {
    const vm = inbox();
    await finish(env, vm.onShown());
    return vm;
  };

  return { ...env, router, toast, toasts, repository, navigator, sync, inbox, detail, openInbox };
}

export type NotificationHarness = ReturnType<typeof createNotificationHarness>;

/** body가 ready일 때만 목록을 돌려준다. */
export function itemsOf(state: InboxState): { id: string; readAt: number | null }[] {
  if (state.body.status !== 'ready') throw new Error(`body is ${state.body.status}`);
  return state.body.items;
}

/** 목록의 알림 번호(끝 두 자리). */
export const numbers = (state: InboxState): number[] => itemsOf(state).map((item) => Number(item.id.slice(-2)));

/** 1부터 to까지. */
export const upTo = (to: number, from = 1): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);
