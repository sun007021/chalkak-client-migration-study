import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { parseDisplayRoute } from './displayDates';
import { planUrlWrite, takeWrittenSearch } from './displayUrlSync';
import type { DisplayState, DisplayViewModel } from './DisplayViewModel';


/**
 * 전시 URL(date·sort)과 ViewModel 상태를 맞춘다.
 * - URL → 상태: 마운트·Link·주소 변경은 applyRoute로 반영한다(같은 값이면 ViewModel이 아무 일도 하지 않는다).
 * - 상태 → URL: 날짜·정렬이 바뀌면 replace로 쓴다(location.state는 보존). 쓴 search는 pending에 쌓아 두고, 그 URL이 뒤늦게 location으로 돌아오면
 *   반영을 건너뛴다: 빠르게 B → C로 옮길 때 늦게 온 B가 상태를 B로 되돌리지 못한다.
 * 쓸지 말지는 렌더 시점의 state가 아니라 ViewModel의 지금 값과 "곧 도착할 URL"(pending의 마지막)을 기준으로 정한다.
 */
export function useDisplayUrlSync(vm: DisplayViewModel, state: Pick<DisplayState, 'date' | 'sort' | 'today'>): void {
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
    void vm.applyRoute(parseDisplayRoute(location.search));
  }, [vm, location.search]);

  useEffect(() => {
    const { date, sort, today } = vm.state;
    const now = latest.current;
    const expected = pending.current.at(-1) ?? now.search;
    const next = planUrlWrite(expected, { date, sort, today });
    if (next === null) return;
    pending.current = [...pending.current, next];
    void navigate({ pathname: now.pathname, search: next }, { replace: true, state: now.state });
  }, [vm, state.date, state.sort, state.today, navigate]);
}
