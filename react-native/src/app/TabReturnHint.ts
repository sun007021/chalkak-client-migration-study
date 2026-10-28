import type { TabRouteName } from './navigation/routes';

/**
 * "이 탭에서 뒤로 가면 어느 탭으로 돌아가나"를 한 번만 기억하는 작은 힌트. 탭 내비게이터는 기본 백 동작(firstRoute,
 * 비홈 탭에서 뒤로 -> 홈, REQ-NAV-026)을 그대로 두고, 다른 탭이 열어 준 탭(기록 -> 전시)만 힌트가 있을 때 되돌아간다
 * (REQ-NAV-030). 힌트는 연 쪽이 `set`하고 받은 탭이 이탈·탭 누름 때 `clear`한다.
 */
export class TabReturnHint {
  private target: TabRouteName | null = null;

  set(target: TabRouteName): void {
    this.target = target;
  }

  get(): TabRouteName | null {
    return this.target;
  }

  clear(): void {
    this.target = null;
  }
}
