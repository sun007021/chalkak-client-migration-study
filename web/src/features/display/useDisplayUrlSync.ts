import { useSearchSync } from '../../core/ui/useSearchSync';
import { parseDisplayRoute } from './displayDates';
import { planUrlWrite } from './displayUrlSync';
import type { DisplayState, DisplayViewModel } from './DisplayViewModel';

/**
 * 전시 URL(date·sort)과 ViewModel 상태를 맞춘다(공용 useSearchSync).
 * - URL → 상태: 마운트·Link·주소 변경은 applyRoute로 반영한다(같은 값이면 ViewModel이 아무 일도 하지 않는다).
 * - 상태 → URL: 날짜·정렬이 바뀌면 replace로 쓴다. 쓸지 말지는 ViewModel의 지금 값과 "곧 도착할 URL"을 기준으로 정한다.
 */
export function useDisplayUrlSync(vm: DisplayViewModel, state: Pick<DisplayState, 'date' | 'sort' | 'today'>): void {
  useSearchSync({
    identity: vm,
    apply: (search) => void vm.applyRoute(parseDisplayRoute(search)),
    plan: (expected) => {
      const { date, sort, today } = vm.state;
      return planUrlWrite(expected, { date, sort, today });
    },
    trigger: `${state.date}|${state.sort}|${state.today}`,
  });
}
