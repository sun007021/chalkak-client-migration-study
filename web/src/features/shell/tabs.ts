import type { TabDestination } from '../../constants';

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
export function tabPath(_tab: TabDestination): string {
  throw new Error('not implemented');
}

/** 경로 → 탭. 탭 루트가 아니면 null. */
export function tabForPath(_pathname: string): TabDestination | null {
  throw new Error('not implemented');
}

/**
 * 탭 전환의 히스토리 정책(REQ-NAV-006, REQ-NAV-026의 Web 해석).
 * 같은 탭: none. 홈 → 다른 탭: push(state.homeBelow = true). 비홈 → 비홈: replace(현재 state 유지). 비홈 → 홈: homeBelow면 back, 아니면 replace(state.homeBelow = false).
 */
export function planTabNavigation(_current: TabDestination, _target: TabDestination, _history: TabHistoryState | null): TabNavigation {
  throw new Error('not implemented');
}
