import { useEffect, useState } from 'react';

/**
 * 첫 커밋의 효과(useViewModel의 구독 포함)가 끝난 뒤에 true.
 * useOwnedViewModel처럼 효과에서 ViewModel을 만드는 화면은 마지막 커밋과 구독 사이에 틈이 생긴다: DOM은 이미 보이는데 아직 구독이 없어
 * 그 사이의 입력이 화면에 반영되지 않는다. 화면 본문을 이 값이 true일 때부터 그리면 보이는 시점에는 구독이 이미 붙어 있다.
 * useViewModel보다 뒤에서 호출해야 한다(효과는 선언 순서대로 돈다).
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
