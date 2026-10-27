import { ROUTES } from '../../app/paths';
import type { TabDestination } from '../../constants';
import type { SessionMode } from '../boot/authGate';

/** 하단 바의 탭 4종(왼쪽부터). 업로드 버튼은 탭이 아니다. */
export const MAIN_TABS: readonly TabDestination[] = ['home', 'display', 'record', 'settings'];

/** 탭이 위에 홈 항목을 두고 있는지. 브라우저 히스토리 항목의 location.state로 저장되어 새로고침해도 남는다. */
export interface TabHistoryState {
  homeBelow: boolean;
}

export type TabNavigation =
  | { kind: 'none' }
  | { kind: 'push'; to: string; state: TabHistoryState }
  | { kind: 'replace'; to: string; state: TabHistoryState }
  | { kind: 'back' };

/** 탭 → 경로(ROUTES.home/display/record/settings). */
export function tabPath(tab: TabDestination): string {
  return ROUTES[tab];
}

/** 경로 → 탭. 탭 루트가 아니면 null. */
export function tabForPath(pathname: string): TabDestination | null {
  const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname; // 라우터는 끝 슬래시를 같은 경로로 본다
  return MAIN_TABS.find((tab) => tabPath(tab) === normalized) ?? null;
}

/** 이 모드로 탭 화면을 열 수 있는지(D-05). 게스트는 기록 탭을 열 수 없다. 탭 버튼과 URL 직접 진입이 같은 판정을 쓴다. */
export function canEnterTab(mode: SessionMode, tab: TabDestination): boolean {
  return !(mode === 'guest' && tab === 'record');
}

/** 탭 목록에서 방향키로 옮길 탭(roving tabindex). 양 끝은 순환한다. 방향키가 아니면 null. */
export function adjacentTab(current: TabDestination, key: string): TabDestination | null {
  const index = MAIN_TABS.indexOf(current);
  const last = MAIN_TABS.length - 1;
  if (key === 'ArrowRight') return MAIN_TABS[index === last ? 0 : index + 1] ?? null;
  if (key === 'ArrowLeft') return MAIN_TABS[index === 0 ? last : index - 1] ?? null;
  if (key === 'Home') return MAIN_TABS[0] ?? null;
  if (key === 'End') return MAIN_TABS[last] ?? null;
  return null;
}

/**
 * location.state에서 TabHistoryState를 꺼낸다. 모양이 맞지 않으면(boolean이 아님 포함) null.
 * 앱 안에서 만든 항목만 믿는다: location.key가 'default'(이 탭 히스토리의 첫 항목, 직접 진입)이면 홈이 아래에 있다고 볼 수 없으므로 state가 있어도 null.
 */
export function readTabHistoryState(state: unknown, locationKey: string): TabHistoryState | null {
  if (locationKey === 'default') return null;
  if (typeof state !== 'object' || state === null) return null;
  const homeBelow = (state as { homeBelow?: unknown }).homeBelow;
  return typeof homeBelow === 'boolean' ? { homeBelow } : null;
}

/**
 * 탭 전환의 히스토리 정책(REQ-NAV-006, REQ-NAV-026의 Web 해석).
 * 같은 탭: none. 홈 → 다른 탭: push(state.homeBelow = true). 비홈 → 비홈: replace(현재 state 유지). 비홈 → 홈: homeBelow면 back, 아니면 replace(state.homeBelow = false).
 */
export function planTabNavigation(current: TabDestination, target: TabDestination, history: TabHistoryState | null): TabNavigation {
  if (current === target) return { kind: 'none' };
  const to = tabPath(target);
  if (current === 'home') return { kind: 'push', to, state: { homeBelow: true } };
  const homeBelow = history?.homeBelow ?? false;
  if (target === 'home' && homeBelow) return { kind: 'back' };
  return { kind: 'replace', to, state: { homeBelow: target === 'home' ? false : homeBelow } };
}
