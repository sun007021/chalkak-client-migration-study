import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { ROUTES } from '../../app/paths';
import { useOwnedViewModel } from '../../core/state/useOwnedViewModel';
import { useViewModel } from '../../core/state/useViewModel';
import { DevSessionService } from './DevSessionService';
import { DevSessionViewModel } from './DevSessionViewModel';

/**
 * 개발 전용 세션 주입 화면('/dev/session'). 개발 플래그가 켜진 빌드에서만 동적 import로 번들에 들어간다(Q-02).
 * 아래 문구는 모두 개발 전용 하드코딩이다. testid 없이 role/label로 찾는다:
 * "Refresh token"(password 입력), textbox "User ID", button "세션 주입", 실패는 role="alert". 성공하면 /home으로 replace.
 */
export function DevSessionScreen(): ReactNode {
  const { devSessionDeps } = useContainer();
  const create = useCallback(() => (devSessionDeps ? new DevSessionViewModel(new DevSessionService(devSessionDeps)) : null), [devSessionDeps]);
  const vm = useOwnedViewModel(create);
  return vm ? <DevSessionForm vm={vm} /> : null;
}

function DevSessionForm({ vm }: { vm: DevSessionViewModel }): ReactNode {
  const navigate = useNavigate();
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
        <input type="password" value={state.refreshToken} onChange={(e) => vm.setRefreshToken(e.target.value)} autoComplete="off" />
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
