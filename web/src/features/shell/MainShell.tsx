import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { color, font } from '../../design/tokens';
import { IcBottomDisplay, IcBottomDisplaySelected, IcBottomHome, IcBottomHomeSelected, IcBottomRecord, IcBottomRecordSelected, IcBottomSetting, IcBottomSettingSelected, IcBottomWrite } from '../../core/ui/icons.generated';
import type { IconComponent } from '../../core/ui/icons.generated';
import { createPortal } from 'react-dom';
import { Navigate, Outlet, useLocation, useMatches, useNavigate, useOutletContext } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { ROUTES } from '../../app/paths';
import type { TabDestination } from '../../constants';
import { t } from '../../copy/ko';
import type { CopyKey } from '../../copy/ko';
import { useScreenView } from '../../core/analytics/useScreenView';
import { useOwnedViewModel } from '../../core/state/useOwnedViewModel';
import type { SessionMode } from '../boot/authGate';
import type { MainShellViewModel, ReselectSource } from './MainShellViewModel';
import { MAIN_TABS, adjacentTab, canEnterTab, readTabHistoryState } from './tabs';

/** 탭 라우트의 handle. 현재 탭은 URL 문자열이 아니라 일치한 라우트에서 읽는다. */
export interface TabRouteHandle {
  tab: TabDestination;
}

/** 탭 화면이 Outlet 컨텍스트로 받는 값. */
export interface ShellContext {
  mode: SessionMode;
  /** 탭 재선택 구독(전시 맨 위 스크롤 등). 셸 ViewModel 전체가 아니라 구독 하나만 내준다. */
  shell: ReselectSource;
}

export const useShellContext = (): ShellContext => useOutletContext<ShellContext>();

/** 하단 바를 <main> 밖에 그리기 위한 자리. 루트 레이아웃이 <main> 옆에 둔다. */
export const BottomBarSlotContext = createContext<HTMLElement | null>(null);

/**
 * 하단 바 높이(safe-area 포함). 바 자체, 콘텐츠 하단 여백, 토스트 위치(CSS 변수)가 모두 이 값 하나를 쓴다.
 * 원본 플랫 바(screens-a §3.3, §3.6): 위 15 + 항목 48 + 아래 10 = 73.
 */
const BAR_HEIGHT = 'calc(73px + env(safe-area-inset-bottom, 0px))';
const TAB_LABELS: Readonly<Record<TabDestination, CopyKey>> = {
  home: 'nav.tab.home',
  display: 'nav.tab.display',
  record: 'nav.tab.record',
  settings: 'nav.tab.settings',
};
// check-testids가 리터럴을 찾으므로 맵으로 둔다.
const TAB_TEST_IDS: Readonly<Record<TabDestination, string>> = {
  home: 'bottom-bar.tab-home',
  display: 'bottom-bar.tab-display',
  record: 'bottom-bar.tab-record',
  settings: 'bottom-bar.tab-settings',
};
/** 탭 네 개가 놓이는 격자 칸(가운데 세 번째 칸은 업로드 버튼 자리). */
const TAB_COLUMNS: Readonly<Record<TabDestination, number>> = { home: 1, display: 2, record: 4, settings: 5 };

const TAB_ICONS: Readonly<Record<TabDestination, { off: IconComponent; on: IconComponent }>> = {
  home: { off: IcBottomHome, on: IcBottomHomeSelected },
  display: { off: IcBottomDisplay, on: IcBottomDisplaySelected },
  record: { off: IcBottomRecord, on: IcBottomRecordSelected },
  settings: { off: IcBottomSetting, on: IcBottomSettingSelected },
};

// 원본 Android ChalkakBottomBar / iOS 플랫 바(screens-a §3.3, §3.6): 흰 바탕, 위 15·아래 10, 아이콘 23 + 간격 7 + footnote 라벨.
const barStyle: CSSProperties = {
  position: 'fixed',
  left: 'var(--column-inset)',
  right: 'var(--column-inset)',
  bottom: 0,
  zIndex: 100,
  display: 'grid',
  boxSizing: 'border-box',
  height: BAR_HEIGHT,
  paddingTop: 15,
  paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
  paddingLeft: 'env(safe-area-inset-left, 0px)',
  paddingRight: 'env(safe-area-inset-right, 0px)',
  background: color.surfaceElevated,
  borderTop: `1px solid ${color.border}`,
};
const tablistStyle: CSSProperties = { gridArea: '1 / 1', display: 'grid', gridTemplateColumns: '1fr 1fr 64px 1fr 1fr', minWidth: 0 };
const tabStyle = (tab: TabDestination, selected: boolean): CSSProperties => ({
  gridColumn: TAB_COLUMNS[tab],
  minWidth: 0,
  minHeight: 48,
  padding: 0,
  border: 0,
  background: 'none',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  ...font('footnote'),
  fontWeight: selected ? 700 : 400,
  color: selected ? color.actionPrimary : color.bottomBar,
  cursor: 'pointer',
});
// add 버튼: ic_bottom_write(40 원, #2B2724, + 표시). 가운데 칸에 놓는다.
const uploadStyle: CSSProperties = {
  gridArea: '1 / 1',
  justifySelf: 'center',
  alignSelf: 'center',
  width: 48,
  height: 48,
  padding: 0,
  border: 0,
  background: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

function TabIconOn({ tab }: { tab: TabDestination }): ReactNode {
  const Icon = TAB_ICONS[tab].on;
  return <Icon size={23} />;
}
function TabIconOff({ tab }: { tab: TabDestination }): ReactNode {
  const Icon = TAB_ICONS[tab].off;
  return <Icon size={23} />;
}

function currentTab(matches: readonly { handle?: unknown }[]): TabDestination | null {
  for (const match of matches) {
    const tab = (match.handle as Partial<TabRouteHandle> | undefined)?.tab;
    if (tab) return tab;
  }
  return null;
}

/**
 * 보호된 메인 화면의 공통 틀. 탭 화면(Outlet)과 하단 바(<main> 밖 자리에 포털)를 그린다.
 * 하단 바는 탭 네 경로에만 있다(탭 화면이 이 레이아웃의 자식이라서).
 */
export function MainShell({ mode }: { mode: SessionMode }): ReactNode {
  const container = useContainer();
  const slot = useContext(BottomBarSlotContext);
  const create = useCallback(() => container.createMainShellViewModel(mode), [container, mode]);
  const vm = useOwnedViewModel(create);

  // 토스트가 하단 바 위에 뜨도록 높이를 CSS 변수로 알린다.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--bottom-bar-height', BAR_HEIGHT);
    return () => void root.style.removeProperty('--bottom-bar-height');
  }, []);

  if (!vm || !slot) return null;
  const context: ShellContext = { mode, shell: vm };
  return (
    <div style={{ minHeight: '100dvh', paddingBottom: BAR_HEIGHT, boxSizing: 'border-box' }}>
      <Outlet context={context} />
      {createPortal(<BottomBar vm={vm} />, slot)}
    </div>
  );
}

function BottomBar({ vm }: { vm: MainShellViewModel }): ReactNode {
  const selected = currentTab(useMatches());
  const location = useLocation();
  const navigate = useNavigate();
  const tabRefs = useRef<Partial<Record<TabDestination, HTMLButtonElement | null>>>({});

  const onSelect = (target: TabDestination) => {
    if (!selected) return;
    const plan = vm.selectTab(selected, target, readTabHistoryState(location.state, location.key));
    if (plan.kind === 'push') void navigate(plan.to, { state: plan.state });
    else if (plan.kind === 'replace') void navigate(plan.to, { replace: true, state: plan.state });
    else if (plan.kind === 'back') void navigate(-1);
  };

  const onKeyDown = (event: KeyboardEvent, from: TabDestination) => {
    const next = adjacentTab(from, event.key);
    if (!next) return;
    event.preventDefault();
    tabRefs.current[next]?.focus();
  };

  return (
    <nav data-testid="bottom-bar.root" style={barStyle}>
      <div role="tablist" style={tablistStyle}>
        {MAIN_TABS.map((tab) => (
          <button
            key={tab}
            ref={(el) => {
              tabRefs.current[tab] = el;
            }}
            type="button"
            role="tab"
            data-testid={TAB_TEST_IDS[tab]}
            aria-selected={selected === tab}
            tabIndex={selected === tab ? 0 : -1}
            style={tabStyle(tab, selected === tab)}
            onClick={() => onSelect(tab)}
            onKeyDown={(event) => onKeyDown(event, tab)}
          >
            {selected === tab ? <TabIconOn tab={tab} /> : <TabIconOff tab={tab} />}
            <span>{t(TAB_LABELS[tab])}</span>
          </button>
        ))}
      </div>
      <button type="button" data-testid="bottom-bar.upload-button" aria-label={t('nav.tab.upload.a11y')} style={uploadStyle} onClick={() => vm.pressUpload()}>
        <IcBottomWrite size={40} />
      </button>
    </nav>
  );
}

/** 게이트를 통과해 실제로 그려진 탭 화면. 화면이 그려질 때 screen_view를 보낸다(전역 경로 추적은 탭을 보내지 않는다). 각 기능 PR이 자리표시를 대체한다. */
export function TabPlaceholder({ tab, testId }: { tab: TabDestination; testId: string }): ReactNode {
  useScreenView(tab);
  return <div data-testid={testId} />;
}

/**
 * 접근할 수 없는 탭에 URL로 직접 들어오면(게스트의 /record) 화면을 열지 않고 홈으로 replace + 토스트(TC-NAV-016, 임시안).
 * 자식은 통과했을 때만 렌더되므로 차단된 화면은 screen_view도 보내지 않는다. 토스트는 StrictMode의 이중 효과에도 1회다.
 */
export function TabGate({ tab, children }: { tab: TabDestination; children: ReactNode }): ReactNode {
  const { mode } = useShellContext();
  const { guestGate } = useContainer();
  const allowed = canEnterTab(mode, tab);
  const notified = useRef(false);
  useEffect(() => {
    if (allowed || notified.current) return;
    notified.current = true;
    guestGate.requireMember(mode, 'record');
  }, [allowed, mode, guestGate]);
  return allowed ? children : <Navigate to={ROUTES.home} replace />;
}
