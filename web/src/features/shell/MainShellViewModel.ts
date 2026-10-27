import type { AnalyticsReporter } from '../../core/analytics/AnalyticsReporter';
import { ViewModel } from '../../core/state/ViewModel';
import type { TabDestination } from '../../constants';
import type { SessionMode } from '../boot/authGate';
import type { GuestGate } from './GuestGate';
import type { TabHistoryState, TabNavigation } from './tabs';
import type { UploadEntry } from './UploadEntry';

export interface MainShellState {
  mode: SessionMode;
  /** 선택 표시가 있는 탭 하나. 업로드 버튼은 선택되지 않는다. */
  selected: TabDestination;
}

export interface MainShellDeps {
  mode: SessionMode;
  guestGate: GuestGate;
  analytics: AnalyticsReporter;
  uploadEntry: UploadEntry;
}

/**
 * 메인 셸(하단 바) 상태. URL이 탭의 근거이므로 화면은 경로가 바뀔 때마다 syncSelected로 맞춘다.
 * selectTab은 허용되면 selected를 바꾸고 이동 계획을 돌려준다(이동은 화면이 한다).
 */
export class MainShellViewModel extends ViewModel<MainShellState> {
  constructor(_deps: MainShellDeps, _initialTab: TabDestination = 'home') {
    super({ mode: 'member', selected: 'home' });
    throw new Error('not implemented');
  }

  /** 새로고침 복원·브라우저 뒤로/앞으로로 경로가 바뀐 결과를 반영한다. 분석·게스트 판정은 하지 않는다. */
  syncSelected(_tab: TabDestination): void {
    throw new Error('not implemented');
  }

  /**
   * 하단 바 탭 선택. 게스트의 기록 탭은 { kind: 'none' } + 토스트(분석 없음, selected 불변).
   * 허용되면 bottom_navigation_selected를 보낸다(같은 탭 재선택 포함, TC-ANL-014 임시안). 같은 탭이면 reselect 리스너를 부르고 { kind: 'none' }.
   */
  selectTab(_tab: TabDestination, _history: TabHistoryState | null): TabNavigation {
    throw new Error('not implemented');
  }

  /** 같은 탭 재선택(전시·홈 맨 위 스크롤 등 탭 화면이 처리). */
  subscribeReselect(_listener: (tab: TabDestination) => void): () => void {
    throw new Error('not implemented');
  }

  /** 업로드 버튼. 게스트면 토스트 nav.guest.upload, 회원이면 uploadEntry.start(). selected·분석은 건드리지 않는다. */
  pressUpload(): void {
    throw new Error('not implemented');
  }
}
