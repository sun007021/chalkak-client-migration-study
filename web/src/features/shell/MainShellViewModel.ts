import type { AnalyticsReporter } from '../../core/analytics/AnalyticsReporter';
import { ViewModel } from '../../core/state/ViewModel';
import type { TabDestination } from '../../constants';
import type { SessionMode } from '../boot/authGate';
import type { GuestGate } from './GuestGate';
import { canEnterTab, planTabNavigation } from './tabs';
import type { TabHistoryState, TabNavigation } from './tabs';
import type { UploadEntry } from './UploadEntry';

export interface MainShellState {
  mode: SessionMode;
}

export interface MainShellDeps {
  mode: SessionMode;
  guestGate: GuestGate;
  analytics: AnalyticsReporter;
  uploadEntry: UploadEntry;
}

/**
 * 메인 셸(하단 바) 로직. 선택된 탭은 URL에서만 파생되므로(화면이 현재 탭을 넘긴다) 상태로 들고 있지 않다.
 * selectTab은 허용되면 분석을 보내고 이동 계획을 돌려준다(이동은 화면이 한다).
 */
export class MainShellViewModel extends ViewModel<MainShellState> {
  private readonly reselectListeners = new Set<(tab: TabDestination) => void>();

  constructor(private readonly deps: MainShellDeps) {
    super({ mode: deps.mode });
  }

  /**
   * 하단 바 탭 선택. 게스트의 기록 탭은 { kind: 'none' } + 토스트(분석 없음).
   * 허용되면 bottom_navigation_selected를 보낸다(같은 탭 재선택 포함, TC-ANL-014 임시안). 같은 탭이면 reselect 리스너를 부르고 { kind: 'none' }.
   */
  selectTab(current: TabDestination, tab: TabDestination, history: TabHistoryState | null): TabNavigation {
    if (!canEnterTab(this.state.mode, tab)) {
      this.deps.guestGate.requireMember(this.state.mode, 'record');
      return { kind: 'none' };
    }
    this.deps.analytics.tabSelected(tab);
    const plan = planTabNavigation(current, tab, history);
    if (plan.kind === 'none') for (const listener of [...this.reselectListeners]) listener(tab);
    return plan;
  }

  /** 같은 탭 재선택(전시·홈 맨 위 스크롤 등 탭 화면이 처리). */
  subscribeReselect(listener: (tab: TabDestination) => void): () => void {
    this.reselectListeners.add(listener);
    return () => {
      this.reselectListeners.delete(listener);
    };
  }

  /** 업로드 버튼. 게스트면 토스트 nav.guest.upload, 회원이면 uploadEntry.start(). 분석은 보내지 않는다. */
  pressUpload(): void {
    if (this.deps.guestGate.requireMember(this.state.mode, 'upload')) this.deps.uploadEntry.start();
  }

  override dispose(): void {
    this.reselectListeners.clear();
    super.dispose();
  }
}
