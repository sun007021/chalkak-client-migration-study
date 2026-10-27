import { useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { ROUTES } from '../../app/paths';
import { useContainer } from '../../app/AppContext';
import { t } from '../../copy/ko';
import { useOwnedViewModel } from '../../core/state/useOwnedViewModel';
import { useViewModel } from '../../core/state/useViewModel';
import type { BootViewModel } from './BootViewModel';

/** 스플래시 화면: data-testid="splash.logo"만. 세션을 읽는 동안에도 로그인 화면이 번쩍이지 않는다. */
export function SplashView(): ReactNode {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
      <div data-testid="splash.logo" style={{ fontSize: 32, fontWeight: 700 }}>
        {t('app.name')}
      </div>
    </div>
  );
}

/** '/' 라우트. BootViewModel을 만들어 start()하고 ready가 되면 판정에 따라 /login 또는 /home으로 replace 이동한다. */
export function BootScreen(): ReactNode {
  const container = useContainer();
  const create = useCallback(() => container.createBootViewModel(), [container]);
  const vm = useOwnedViewModel(create);
  return vm ? <BootRun vm={vm} /> : <SplashView />;
}

function BootRun({ vm }: { vm: BootViewModel }): ReactNode {
  const state = useViewModel(vm);
  useEffect(() => {
    void vm.start();
  }, [vm]);
  if (state.phase === 'splash') return <SplashView />;
  if (state.decision.destination === 'login') return <Navigate to={ROUTES.login} replace />;
  return <Navigate to={ROUTES.home} replace state={{ preloadFailed: state.preloadFailed }} />;
}
