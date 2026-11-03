import { useSearchSync } from '../../core/ui/useSearchSync';
import { parseRecordRoute, planRecordUrlWrite } from './recordMonths';
import type { RecordState, RecordViewModel } from './RecordViewModel';

/**
 * 기록 URL(`?date=`)과 ViewModel 선택 날짜를 맞춘다(공용 useSearchSync).
 * - URL → 상태: 마운트·Link·주소 변경은 applyRoute로 반영한다.
 * - 상태 → URL: 선택 날짜가 바뀌면 planRecordUrlWrite 결과를 replace로 쓴다.
 * 불러오는 중·오류(선택이 없는 것이 "아직"인 때)에는 URL의 date를 지우지 않는다: 진입한 날짜가 첫 조회 동안·다시 시도까지 남는다.
 */
export function useRecordUrlSync(vm: RecordViewModel, state: Pick<RecordState, 'selectedDate' | 'body'>): void {
  useSearchSync({
    identity: vm,
    apply: (search) => void vm.applyRoute(parseRecordRoute(search)),
    plan: (expected) => {
      const { selectedDate, body } = vm.state;
      return selectedDate === null && body.status !== 'ready' ? null : planRecordUrlWrite(expected, selectedDate);
    },
    trigger: `${state.selectedDate}|${state.body.status}`,
  });
}
