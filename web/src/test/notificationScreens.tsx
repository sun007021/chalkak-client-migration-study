import { act, screen, waitFor } from '@testing-library/react';
import type { VisibilityObserverFactory } from '../core/ui/VisibilityObserver';
import { makeHarness, renderApp } from './appHarness';
import type { Harness } from './appHarness';
import { FixtureRouter, json } from './fixtureRouter';
import type { RouteValue } from './fixtureRouter';
import { loadFixture, memberSession } from './fixtures';
import { MEMBER_ROUTES } from './homeHarness';
import { NOTIFICATION_ROUTES, PAGE1, UNREAD_KEY, readKey } from './notificationHarness';
import { POST_ROUTES } from './postRoutes';

export interface OpenNotificationsOptions {
  routes?: Record<string, RouteValue>;
  visibilityObserver?: VisibilityObserverFactory | null;
  /** renderApp의 첫 위치. 기본 '/notifications'(새로고침·딥링크로 첫 항목이 된 경우와 같다). */
  path?: string | { pathname: string; state?: unknown };
  /** 이 testid가 보일 때까지 기다린다. 기본은 경로에 맞는 화면 루트. null이면 기다리지 않는다. */
  waitFor?: string | null;
}

const rootFor = (pathname: string): string =>
  pathname.startsWith('/home') ? 'home.root' : pathname.startsWith('/feed') ? 'feed.root' : /^\/notifications\/.+/.test(pathname) ? 'notification-detail.root' : 'notifications.root';

/** 회원 앱에 홈·전시·상세·알림 라우트를 모두 깔고 첫 화면을 그린다(홈 → 알림함 → 상세·게시물 흐름을 한 하네스에서). */
export async function openNotifications(options: OpenNotificationsOptions = {}) {
  const h = makeHarness({ session: memberSession(), visibilityObserver: options.visibilityObserver });
  const path = options.path ?? '/notifications';
  const pathname = typeof path === 'string' ? path : path.pathname;
  const startsAtHome = pathname.startsWith('/home');
  const fixtures = new FixtureRouter(h.ff, { ...(startsAtHome ? { ...POST_ROUTES, ...MEMBER_ROUTES } : { ...MEMBER_ROUTES, ...POST_ROUTES }), ...NOTIFICATION_ROUTES, ...options.routes });
  const view = renderApp(h.container, path);
  const root = options.waitFor === undefined ? rootFor(pathname) : options.waitFor;
  if (root) await screen.findByTestId(root);
  return { h, fixtures, ...view };
}

export const toastText = (): string | null => screen.queryByTestId('toast.message')?.textContent ?? null;

export const advance = async (h: Harness, ms: number): Promise<void> => {
  await act(async () => {
    await h.clock.advance(ms);
  });
};

/** 알림함 첫 로드가 끝날 때까지(로딩 표시가 사라지고 목록이 보일 때까지) 기다린다. */
export const inboxLoaded = async (): Promise<void> => {
  await screen.findByTestId('notifications.list');
  await waitFor(() => expect(screen.queryByTestId('notifications.loading')).not.toBeInTheDocument());
};

/** 서버 쪽 읽음·미읽음 상태를 흉내 내는 상태 있는 가짜 서버: 읽음 PATCH가 목록·미읽음 응답에 반영된다. */
export function createNotificationServer(fixtures: FixtureRouter, options: { unread?: boolean } = {}) {
  const state = { read: new Set<string>(), unread: options.unread ?? true };
  const base = () => structuredClone(loadFixture('notification/notifications__page1.json').json) as { notifications: { id: string; readAt: string | null }[] };
  fixtures.set(PAGE1, () => {
    const body = base();
    for (const item of body.notifications) if (state.read.has(item.id)) item.readAt = '2026-10-27T03:00:00Z';
    return json(200, body);
  });
  fixtures.set(UNREAD_KEY, () => json(200, { hasUnread: state.unread }));
  for (let n = 1; n <= 28; n += 1) {
    const id = `33333333-3333-4333-8333-3333333333${String(n).padStart(2, '0')}`;
    fixtures.set(readKey(n), () => {
      state.read.add(id);
      state.unread = false;
      return new Response(null, { status: 204 });
    });
  }
  return state;
}
