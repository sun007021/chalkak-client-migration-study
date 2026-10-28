import { createNetHarness, refreshOk } from '../../../core/http/__testing__/createNetHarness';
import { FakeToastPresenter } from '../../../core/toast/__testing__/FakeToastPresenter';
import { FakeAnalyticsTracker } from '../../../core/analytics/__testing__/FakeAnalyticsTracker';
import { FixtureRouter, type RouteValue } from '../../../data/__testing__/FixtureRouter';
import { NotificationRepository } from '../../../data/notification/NotificationRepository';
import { FakeAuthFlowNavigator } from '../../auth/__testing__/FakeAuthFlowNavigator';
import { NotificationEvents } from '../NotificationEvents';
import { NotificationTapProcessor } from '../NotificationTapProcessor';
import type { HomeNotificationTarget } from '../NotificationTapProcessor';
import { FakeNotificationNavigator } from './FakeNotificationNavigator';

/** 기준 시각: KST 2026-10-27(화) 12:00. */
export const NOW = '2026-10-27T03:00:00Z';
export const MY_POST_ID = '22222222-2222-4222-8222-222222222201';
export const nid = (nn: string): string => `33333333-3333-4333-8333-3333333333${nn}`;

export const LIST_P1 = 'GET /notifications?page=1&pageSize=20';
export const LIST_P2 = 'GET /notifications?page=2&pageSize=20';
export const UNREAD = 'GET /notifications/unread-status';
export const readKey = (id: string): string => `PATCH /notifications/${id}/read`;
export const detailKey = (id: string): string => `GET /notifications/${id}`;

/** 알림 화면의 성공 경로 기본 라우트. 테스트가 필요한 키만 router.set으로 바꾼다. */
export const NOTI_ROUTES: Record<string, RouteValue> = {
  [LIST_P1]: 'notification/notifications__page1',
  [LIST_P2]: 'notification/notifications__page2-last',
  [UNREAD]: 'notification/unread-status__true',
  'POST /auth/refresh': () => refreshOk(),
};

/** 홈 ViewModel 대역: 미읽음 재조회와 TOPIC 새로고침 호출만 센다. */
export class FakeHomeNotificationTarget implements HomeNotificationTarget {
  unreadRefreshes = 0;
  pushOpened = 0;

  async onPushReceived(): Promise<void> {
    this.unreadRefreshes += 1;
  }

  async onHomePushOpened(): Promise<void> {
    this.pushOpened += 1;
  }
}

export type NotificationHarnessOptions = {
  routes?: Record<string, RouteValue>;
  /** false면 세션을 만들지 않는다(로그아웃 상태). */
  signedIn?: boolean;
};

export async function createNotificationHarness(options: NotificationHarnessOptions = {}) {
  const net = createNetHarness();
  net.clock.set(NOW);
  if (options.signedIn !== false) await net.signIn();
  const router = new FixtureRouter({ ...NOTI_ROUTES, ...options.routes }).install(net.transport);
  const repository = new NotificationRepository({ api: net.api });
  const navigator = new FakeNotificationNavigator();
  const toast = new FakeToastPresenter();
  const authFlow = new FakeAuthFlowNavigator();
  const analytics = new FakeAnalyticsTracker();
  const events = new NotificationEvents();
  const home = new FakeHomeNotificationTarget();
  const processor = new NotificationTapProcessor({
    notifications: repository,
    navigator,
    home: () => home,
    events,
    sessionStore: net.sessionStore,
    toast,
    authFlow,
  });
  return {
    ...net,
    router,
    repository,
    navigator,
    toast,
    authFlow,
    analytics,
    events,
    home,
    processor,
  };
}

export type NotificationHarness = Awaited<ReturnType<typeof createNotificationHarness>>;

/** 마이크로태스크를 충분히 비운다(요청 시작·응답 반영 확인용). */
export async function flush(times = 60): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

/** 응답을 직접 풀어 줄 때까지 붙잡는 라우트 값. */
export function deferredRoute(fixture: string): { value: RouteValue; release: () => void } {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  // fixtureResponse를 지연 로드하지 않도록 라우트 함수 안에서 가져온다.
  const value: RouteValue = async () => {
    await gate;
    const { fixtureResponse } = await import('../../../core/http/__testing__/loadFixture');
    return fixtureResponse(fixture);
  };
  return { value, release };
}
