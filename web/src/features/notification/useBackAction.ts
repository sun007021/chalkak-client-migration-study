import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { Location } from 'react-router';
import type { BackToInboxPlan } from './notificationNavigation';

/** 현재 location으로 plan을 세워 뒤로(-1) 또는 replace 이동하는 안정적인 콜백. 화면이 다시 그려져도 콜백 참조가 바뀌지 않는다. */
export function useBackAction(plan: (location: Location) => BackToInboxPlan): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const ref = useRef<() => void>(() => undefined);
  useEffect(() => {
    ref.current = () => {
      const next = plan(location);
      if (next.kind === 'back') void navigate(-1);
      else void navigate(next.to, { replace: true });
    };
  }, [plan, location, navigate]);
  return useCallback(() => ref.current(), []);
}
