import { act, screen, waitFor } from '@testing-library/react';
import { makeHarness, renderApp } from './appHarness';
import type { Harness } from './appHarness';
import { FixtureRouter } from './fixtureRouter';
import type { RouteValue } from './fixtureRouter';
import { guestSession, memberSession } from './fixtures';
import { MEMBER_ROUTES, GUEST_ROUTES } from './homeHarness';
import { POST_ROUTES, GUEST_POST_ROUTES } from './postRoutes';
import { RECORD_ROUTES, GUEST_RECORD_ROUTES } from './recordRoutes';

export interface OpenRecordOptions {
  mode?: 'member' | 'guest';
  routes?: Record<string, RouteValue>;
  /** renderApp의 첫 위치(경로 또는 {pathname, state}). 기본 '/record'. */
  path?: string | { pathname: string; state?: unknown };
  /** 이 testid가 보일 때까지 기다린다. 기본은 경로에 맞는 화면 루트. null이면 기다리지 않는다. */
  waitFor?: string | null;
  strict?: boolean;
  /** 렌더 직전에 FakeFetch 등을 더 꾸밀 때(첫 요청이 렌더 직후 나가므로 늦게 등록하면 놓친다). */
  beforeRender?: (h: Harness) => void;
}

/**
 * 홈·전시·상세 라우트 위에 기록 라우트를 얹어 실제 라우터로 연다. 홈이 같은 달력 키(2026-10)를 다른 fixture로 읽으므로 기록 라우트가 이긴다
 * (홈 → 기록 흐름의 홈 주간 응답은 테스트가 직접 정한다).
 */
export async function openRecordApp(options: OpenRecordOptions = {}) {
  const mode = options.mode ?? 'member';
  const h = makeHarness({ session: mode === 'member' ? memberSession() : guestSession });
  const home = mode === 'member' ? MEMBER_ROUTES : GUEST_ROUTES;
  const posts = mode === 'member' ? POST_ROUTES : GUEST_POST_ROUTES;
  const record = mode === 'member' ? RECORD_ROUTES : GUEST_RECORD_ROUTES;
  const fixtures = new FixtureRouter(h.ff, { ...home, ...posts, ...record, ...options.routes });
  const path = options.path ?? '/record';
  options.beforeRender?.(h);
  const view = renderApp(h.container, path, { strict: options.strict });
  const pathname = typeof path === 'string' ? path.split('?')[0]! : path.pathname;
  const root = options.waitFor === undefined ? (pathname.startsWith('/feed') ? 'feed.root' : pathname.startsWith('/home') ? 'home.root' : pathname.startsWith('/display') ? 'display.root' : 'record.root') : options.waitFor;
  if (root) await screen.findByTestId(root);
  return { h, fixtures, ...view };
}

/** 첫 로드가 끝날 때까지(로딩 표시가 사라지고 달력이 보일 때까지) 기다린다. */
export const recordLoaded = async (): Promise<void> => {
  await screen.findByTestId('record.calendar-grid');
  await waitFor(() => expect(screen.queryByTestId('record.loading')).not.toBeInTheDocument());
};

export const advanceApp = async (h: Harness, ms: number): Promise<void> => {
  await act(async () => {
    await h.clock.advance(ms);
  });
};
