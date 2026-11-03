import { useEffect, useState } from 'react';

/**
 * 첫 커밋의 효과(useViewModel의 구독 포함)가 끝난 뒤에 true.
 * useOwnedViewModel처럼 효과에서 ViewModel을 만드는 화면은 마지막 커밋과 구독 사이에 틈이 생긴다: DOM은 이미 보이는데 아직 구독이 없어
 * 그 사이의 입력이 화면에 반영되지 않는다. 화면 본문을 이 값이 true일 때부터 그리면 보이는 시점에는 구독이 이미 붙어 있다.
 * useViewModel보다 뒤에서 호출해야 한다(효과는 선언 순서대로 돈다).
 *
 * 한계: 이 훅을 호출한 컴포넌트의 구독만 보장한다. 자식 컴포넌트가 자기 useViewModel로 따로 구독하면(설정의 SignatureCard, PushSection 등)
 * 그 구독은 자식의 효과가 끝나야 붙으므로 같은 틈이 남는다(부모의 두 번째 커밋과 자식의 첫 커밋이 같은 렌더에 들어가 자식 구독이 늦을 수 있다).
 * 근본 해결은 useOwnedViewModel/useViewModel 쪽(별도 PR)에서 하고, 그때까지의 임시 완화책이다.
 */
export function useSubscribed(): boolean {
  const [subscribed, setSubscribed] = useState(false);
  useEffect(() => {
    // 구독이 붙은 뒤의 첫 효과라 의도된 setState다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubscribed(true);
  }, []);
  return subscribed;
}
