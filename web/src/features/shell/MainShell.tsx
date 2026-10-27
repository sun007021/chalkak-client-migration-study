import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { ROUTES } from '../../app/paths';
import type { TabDestination } from '../../constants';
import { t } from '../../copy/ko';
import type { CopyKey } from '../../copy/ko';
import { useOwnedViewModel } from '../../core/state/useOwnedViewModel';
import { useViewModel } from '../../core/state/useViewModel';
import type { SessionMode } from '../boot/authGate';
import type { MainShellViewModel } from './MainShellViewModel';
import { MAIN_TABS, readTabHistoryState, tabForPath } from './tabs';

/** 탭 화면이 Outlet 컨텍스트로 받는 값. */
export interface ShellContext {
  mode: SessionMode;
}

export const useShellContext = (): ShellContext => useOutletContext<ShellContext>();

const BAR_HEIGHT_PX = 64;
const TAB_LABELS: Readonly<Record<TabDestination, CopyKey>> = {
  home: 'nav.tab.home',
  display: 'nav.tab.display',
  record: 'nav.tab.record',
  settings: 'nav.tab.settings',
};

const TAB_TEST_IDS: Readonly<Record<TabDestination, string>> = {
  home: 'bottom-bar.tab-home',
  display: 'bottom-bar.tab-display',
  record: 'bottom-bar.tab-record',
  settings: 'bottom-bar.tab-settings',
};

const barStyle: CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  boxSizing: 'border-box',
  height: `calc(${BAR_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))`,
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  background: '#fff',
  borderTop: '1px solid #e5e5e5',
};
const tabStyle = (selected: boolean): CSSProperties => ({
  flex: '1 1 0',
  minWidth: 0,
  height: '100%',
  padding: 0,
  border: 0,
  background: 'none',
  font: 'inherit',
  fontSize: 12,
  fontWeight: selected ? 700 : 400,
  color: selected ? '#111' : '#888',
  cursor: 'pointer',
});
const uploadStyle: CSSProperties = {
  flex: '0 0 auto',
  width: 48,
  height: 48,
  margin: '0 4px',
  padding: 0,
  border: 0,
  borderRadius: '50%',
  background: '#111',
  color: '#fff',
  fontSize: 28,
  lineHeight: '48px',
  cursor: 'pointer',
};

/**
 * 보호된 메인 화면의 공통 틀. 탭 화면(Outlet) 아래에 하단 바를 고정한다.
 * 하단 바는 탭 네 경로에만 있다(탭 화면이 이 레이아웃의 자식이라서).
 */
export function MainShell({ mode }: { mode: SessionMode }): ReactNode {
  const container = useContainer();
  const { pathname } = useLocation();
  const [initialTab] = useState(() => tabForPath(pathname) ?? 'home');
  const create = useCallback(() => container.createMainShellViewModel(mode, initialTab), [container, mode, initialTab]);
  const vm = useOwnedViewModel(create);
  const context: ShellContext = { mode };

  // 토스트가 하단 바 위에 뜨도록 높이를 CSS 변수로 알린다.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--bottom-bar-height', `calc(${BAR_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))`);
    return () => void root.style.removeProperty('--bottom-bar-height');
  }, []);

  return (
    <div style={{ minHeight: '100dvh', paddingBottom: `calc(${BAR_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))`, boxSizing: 'border-box' }}>
      {vm ? (
        <>
          <Outlet context={context} />
          <BottomBar vm={vm} />
        </>
      ) : null}
    </div>
  );
}

function BottomBar({ vm }: { vm: MainShellViewModel }): ReactNode {
  const { selected } = useViewModel(vm);
  const location = useLocation();
  const navigate = useNavigate();
  const tab = tabForPath(location.pathname);

  useEffect(() => {
    if (tab) vm.syncSelected(tab);
  }, [vm, tab]);

  const onSelect = (target: TabDestination) => {
    const plan = vm.selectTab(target, readTabHistoryState(location.state));
    if (plan.kind === 'push') void navigate(plan.to, { state: plan.state });
    else if (plan.kind === 'replace') void navigate(plan.to, { replace: true, state: plan.state });
    else if (plan.kind === 'back') void navigate(-1);
  };

  const tabButton = (target: TabDestination): ReactNode => (
    <button
      key={target}
      type="button"
      role="tab"
      data-testid={TAB_TEST_IDS[target]}
      aria-selected={selected === target}
      style={tabStyle(selected === target)}
      onClick={() => onSelect(target)}
    >
      {t(TAB_LABELS[target])}
    </button>
  );

  return (
    <nav data-testid="bottom-bar.root" role="tablist" style={barStyle}>
      {MAIN_TABS.slice(0, 2).map(tabButton)}
      <button type="button" data-testid="bottom-bar.upload-button" aria-label={t('nav.tab.upload.a11y')} style={uploadStyle} onClick={() => vm.pressUpload()}>
        <span aria-hidden="true">+</span>
      </button>
      {MAIN_TABS.slice(2).map(tabButton)}
    </nav>
  );
}

/**
 * 기록 탭 라우트. 게스트가 URL로 직접 들어오면 화면을 열지 않고 홈으로 replace + 토스트(TC-NAV-016, 임시안).
 * 재방문 토스트가 중복되지 않도록 효과에서 한 번 보인다.
 */
export function RecordTabRoute({ children }: { children: ReactNode }): ReactNode {
  const { mode } = useShellContext();
  const { guestGate } = useContainer();
  const blocked = mode === 'guest';
  useEffect(() => {
    if (blocked) guestGate.requireMember(mode, 'record');
  }, [blocked, mode, guestGate]);
  return blocked ? <Navigate to={ROUTES.home} replace /> : children;
}
