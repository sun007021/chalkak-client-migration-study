import type { AnalyticsTracker } from '../core/analytics/AnalyticsTracker';
import type { ToastPresenter } from '../core/toast/ToastPresenter';
import type { MainMode } from '../features/auth/AuthFlowNavigator';
import { t } from '../shared/copy';
import type { TabRouteName } from './navigation/routes';

const DESTINATIONS: Record<TabRouteName, string> = {
  Home: 'home',
  Display: 'display',
  Record: 'record',
  Settings: 'settings',
};

export type BottomTabPolicyDeps = {
  /** 부트 단계 밖(null)이면 게스트가 아니므로 막지 않는다. */
  mode: MainMode | null;
  analytics: AnalyticsTracker;
  toast: ToastPresenter;
};

/**
 * 하단 바의 정책(UI 없음). 게스트의 기록 탭 차단, 토스트, 분석 이벤트를 한곳에서 정한다.
 * BottomBar는 결과('proceed' | 'blocked' | 'open-upload')에 따라 이동만 한다(REQ-NAV-009, D-05).
 */
export class BottomTabPolicy {
  constructor(private readonly deps: BottomTabPolicyDeps) {}

  /**
   * 탭을 눌렀다. 게스트의 기록 탭은 토스트만 보이고 막힌다(분석 없음).
   * 그 밖에는 재선택을 포함해 매번 bottom_navigation_selected를 보내고 이동을 허용한다.
   */
  onTabPress(name: TabRouteName): 'proceed' | 'blocked' {
    const { mode, analytics, toast } = this.deps;
    if (name === 'Record' && mode === 'guest') {
      toast.show(t('nav.guest.record'));
      return 'blocked';
    }
    analytics.logEvent('bottom_navigation_selected', { destination: DESTINATIONS[name] });
    return 'proceed';
  }

  /** 업로드 버튼(탭이 아님). 게스트는 토스트만, 회원은 업로드 화면을 연다. */
  onUploadPress(): 'blocked' | 'open-upload' {
    if (this.deps.mode === 'guest') {
      this.deps.toast.show(t('nav.guest.upload'));
      return 'blocked';
    }
    return 'open-upload';
  }
}
