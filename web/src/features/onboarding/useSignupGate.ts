import { useEffect, useState } from 'react';
import { useContainer } from '../../app/AppContext';
import { ROUTES } from '../../app/paths';

export type SignupGate = { kind: 'checking' } | { kind: 'ok' } | { kind: 'redirect'; to: string };

/**
 * 가입 화면(약관·사인·미리보기)의 진입 가드. 마운트 시 한 번만 판정한다.
 * 가입 컨텍스트(SignupDraft)가 있으면 바로 ok. 없으면(새로고침, 가입 완료 뒤 브라우저 뒤로 가기) 저장된 세션을 읽어
 * 회원이면 /home, 아니면 /login으로 보낸다. required가 false면 항상 ok(가드 없음).
 */
export function useSignupGate(required: boolean): SignupGate {
  const container = useContainer();
  const [gate, setGate] = useState<SignupGate>(() => (!required || container.signupDraft.get() !== null ? { kind: 'ok' } : { kind: 'checking' }));
  useEffect(() => {
    if (gate.kind !== 'checking') return;
    let active = true;
    void container.store.read().then(
      (session) => {
        if (active) setGate({ kind: 'redirect', to: session.tokens !== null && !session.isGuest ? ROUTES.home : ROUTES.login });
      },
      () => {
        if (active) setGate({ kind: 'redirect', to: ROUTES.login });
      },
    );
    return () => {
      active = false;
    };
  }, [container, gate.kind]);
  return gate;
}
