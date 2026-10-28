import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { ROUTES } from '../../app/paths';
import type { SessionMode } from '../boot/authGate';
import type { GuestRestriction } from './GuestGate';

/**
 * 회원 전용 화면(알림함, 게시물 상세)의 게스트 차단(D-05). URL로 직접 들어온 게스트는 화면을 열지 않고 홈으로 replace + 해당 게스트 제한 토스트.
 * 자식은 통과했을 때만 렌더되므로 차단된 화면은 요청도 screen_view도 없다. 토스트는 StrictMode의 이중 효과에도 1회다.
 */
export function MemberOnly({ mode, action, children }: { mode: SessionMode; action: GuestRestriction; children: ReactNode }): ReactNode {
  const { guestGate } = useContainer();
  const allowed = mode === 'member';
  const notified = useRef(false);
  useEffect(() => {
    if (allowed || notified.current) return;
    notified.current = true;
    guestGate.requireMember(mode, action);
  }, [allowed, mode, action, guestGate]);
  return allowed ? children : <Navigate to={ROUTES.home} replace />;
}
