import { act, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import type { VisibilityObserverFactory } from '../core/ui/VisibilityObserver';
import { makeHarness, renderApp } from './appHarness';
import type { Harness } from './appHarness';
import { FixtureRouter, json } from './fixtureRouter';
import type { RouteValue } from './fixtureRouter';
import { guestSession, loadFixture, memberSession } from './fixtures';
import { MEMBER_ROUTES, GUEST_ROUTES } from './homeHarness';
import { GUEST_POST_ROUTES, POST_ROUTES } from './postRoutes';

export interface OpenOptions {
  mode?: 'member' | 'guest';
  routes?: Record<string, RouteValue>;
  visibilityObserver?: VisibilityObserverFactory | null;
  /** renderApp의 첫 위치(경로 또는 {pathname, state}). */
  path?: string | { pathname: string; state?: unknown };
  /** 이 testid가 보일 때까지 기다린다. 기본은 경로에 맞는 화면 루트. */
  waitFor?: string | null;
}

/** 홈 라우트 위에 전시·상세·좋아요 라우트를 얹는다(홈 ↔ 전시 ↔ 상세 흐름을 한 하네스에서). */
export async function openApp(options: OpenOptions = {}) {
  const mode = options.mode ?? 'member';
  const h = makeHarness({ session: mode === 'member' ? memberSession() : guestSession, visibilityObserver: options.visibilityObserver });
  const home = mode === 'member' ? MEMBER_ROUTES : GUEST_ROUTES;
  const posts = mode === 'member' ? POST_ROUTES : GUEST_POST_ROUTES;
  const startsAtHome = typeof (options.path ?? '/display') === 'string' ? String(options.path ?? '/display').startsWith('/home') : false;
  // 홈과 전시는 같은 키(어제·오늘 popular)를 서로 다른 fixture로 읽는다. 시작한 화면의 라우트가 이긴다.
  const fixtures = new FixtureRouter(h.ff, { ...(startsAtHome ? { ...posts, ...home } : { ...home, ...posts }), ...options.routes });
  const path = options.path ?? '/display';
  const view = renderApp(h.container, path);
  const pathname = typeof path === 'string' ? path : path.pathname;
  const root = options.waitFor === undefined ? (pathname.startsWith('/feed') ? 'feed.root' : pathname.startsWith('/home') ? 'home.root' : 'display.root') : options.waitFor;
  if (root) await screen.findByTestId(root);
  return { h, fixtures, ...view };
}

export const toastText = (): string | null => screen.queryByTestId('toast.message')?.textContent ?? null;

export const advance = async (h: Harness, ms: number): Promise<void> => {
  await act(async () => {
    await h.clock.advance(ms);
  });
};

/** 전시 첫 로드가 끝날 때까지(로딩 표시가 사라지고 그리드가 보일 때까지) 기다린다. */
export const displayLoaded = async (): Promise<void> => {
  await screen.findByTestId('display.grid');
  await waitFor(() => expect(screen.queryByTestId('display.loading')).not.toBeInTheDocument());
};

/** window.scrollY와 scrollTo를 가짜로 둔다. jsdom은 스크롤을 하지 않으므로 화면이 부른 값만 확인한다. */
export function stubScroll() {
  let y = 0;
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
  const scrollTo = vi.fn((...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'object' && first !== null && 'top' in first) y = Number((first as { top: number }).top);
  });
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  return {
    scrollTo,
    set: (top: number) => {
      y = top;
    },
    /** scrollTo가 받은 top 값들. */
    tops: () => scrollTo.mock.calls.map((c) => (typeof c[0] === 'object' && c[0] !== null ? Number((c[0] as { top: number }).top) : Number(c[1]))),
  };
}

export const idOf = (n: string | number): string => `22222222-2222-4222-8222-222222222${n}`;

/**
 * 목록 응답이 좋아요 가짜 서버의 지금 상태를 반영하게 한다(정적 fixture는 좋아요 전 값을 준다).
 * 정책(PostLikeStore.test): 좋아요가 끝난 뒤 시작한 읽기는 서버 값이 이긴다. 그래서 그 뒤 읽기에 답하는 서버는 좋아요 결과를 알고 있어야 한다.
 * keys: 라우트 키 → 기본 목록 fixture 이름.
 */
export function reflectLikes(fixtures: FixtureRouter, keys: Record<string, string>, postId: string, server: { state: { isLiked: boolean; likeCount: number } }): void {
  for (const [key, fixture] of Object.entries(keys)) {
    fixtures.set(key, () => {
      const base = loadFixture(`${fixture}.json`).json as { posts: { id: string }[] };
      const posts = base.posts.map((p) => (p.id === postId ? { ...p, isLiked: server.state.isLiked, likeCount: server.state.likeCount } : p));
      return json(200, { ...base, posts });
    });
  }
}
