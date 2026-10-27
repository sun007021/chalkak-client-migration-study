import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { ROUTES } from '../../app/paths';
import { useViewModel } from '../../core/state/useViewModel';
import { DevSessionViewModel } from './DevSessionViewModel';
import type { DevSessionService } from './DevSessionService';

/**
 * 개발용 세션 주입 화면('/dev/session', 개발 플래그가 켜졌을 때만 라우트가 있다). testid 없이 role/label로 찾는다:
 * textbox "Refresh token", textbox "User ID", button "세션 주입", 실패는 role="alert". 성공하면 /home으로 replace.
 */
export function DevSessionScreen(): ReactNode {
  const { devSession } = useContainer();
  return devSession ? <DevSessionForm service={devSession} /> : null;
}

function DevSessionForm({ service }: { service: DevSessionService }): ReactNode {
  const navigate = useNavigate();
  const vm = useMemo(() => new DevSessionViewModel(service), [service]);
  const state = useViewModel(vm);
  return (
    <form
      style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}
      onSubmit={(event) => {
        event.preventDefault();
        void vm.submit().then((ok) => {
          if (ok) navigate(ROUTES.home, { replace: true });
        });
      }}
    >
      <label>
        Refresh token
        <input type="text" value={state.refreshToken} onChange={(e) => vm.setRefreshToken(e.target.value)} autoComplete="off" />
      </label>
      <label>
        User ID
        <input type="text" value={state.userId} onChange={(e) => vm.setUserId(e.target.value)} autoComplete="off" />
      </label>
      <button type="submit" disabled={state.busy}>
        세션 주입
      </button>
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
