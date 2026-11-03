import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { takeWrittenSearch } from '../display/displayUrlSync';
import { parseRecordRoute, planRecordUrlWrite } from './recordMonths';
import type { RecordState, RecordViewModel } from './RecordViewModel';

/**
 * 기록 URL(`?date=`)과 ViewModel 선택 날짜를 맞춘다(전시의 useDisplayUrlSync와 같은 구조).
 * - URL → 상태: 마운트·Link·주소 변경은 applyRoute로 반영한다.
 * - 상태 → URL: 선택 날짜가 바뀌면 planRecordUrlWrite 결과를 replace로 쓴다(location.state 보존). 쓴 search는 pending에 쌓고 뒤늦게 돌아오는 그 URL은 반영을 건너뛴다(takeWrittenSearch).
 * 불러오는 중·오류(선택이 없는 것이 "아직"인 때)에는 URL의 date를 지우지 않는다: 진입한 날짜가 첫 조회 동안·다시 시도까지 남는다.
 */
export function useRecordUrlSync(vm: RecordViewModel, state: Pick<RecordState, 'selectedDate' | 'body'>): void {
  const location = useLocation();
  const navigate = useNavigate();
  const latest = useRef(location);
  const pending = useRef<string[]>([]);
  useEffect(() => {
    latest.current = location;
  }, [location]);

  useEffect(() => {
    const taken = takeWrittenSearch(pending.current, location.search);
    pending.current = taken.pending;
    if (taken.ours) return;
    void vm.applyRoute(parseRecordRoute(location.search));
  }, [vm, location.search]);

  useEffect(() => {
    const { selectedDate, body } = vm.state;
    if (selectedDate === null && body.status !== 'ready') return;
    const now = latest.current;
    const expected = pending.current.at(-1) ?? now.search;
    const next = planRecordUrlWrite(expected, selectedDate);
    if (next === null) return;
    pending.current = [...pending.current, next];
    void navigate({ pathname: now.pathname, search: next }, { replace: true, state: now.state });
  }, [vm, state.selectedDate, state.body.status, navigate]);
}
