import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

/**
 * 화면 ViewModel 상태와 URL의 쿼리(location.search)를 맞추는 공용 훅(전시·기록).
 * - URL → 상태: 마운트·Link·주소 변경은 apply(search)로 반영한다. 이 훅이 replace로 쓴 URL이 뒤늦게 돌아오면 건너뛴다(takeWrittenSearch).
 * - 상태 → URL: trigger가 바뀔 때 plan(expectedSearch)이 새 search를 돌려주면 replace로 쓴다(location.state 보존). null이면 쓰지 않는다.
 *   쓸지 말지는 렌더 시점의 상태가 아니라 "곧 도착할 URL"(쓴 것 중 마지막)을 기준으로 정한다: 빠르게 B → C로 옮길 때 늦게 온 B가 상태를 되돌리지 못한다.
 * identity는 ViewModel처럼 바뀌면 URL을 다시 반영해야 하는 대상이다.
 */
export function useSearchSync(options: { identity: unknown; apply: (search: string) => void; plan: (expectedSearch: string) => string | null; trigger: unknown }): void {
  const { identity, apply, plan, trigger } = options;
  const location = useLocation();
  const navigate = useNavigate();
  const latest = useRef(location);
  const pending = useRef<string[]>([]);
  const callbacks = useRef({ apply, plan });
  useEffect(() => {
    latest.current = location;
    callbacks.current = { apply, plan };
  });

  useEffect(() => {
    const taken = takeWrittenSearch(pending.current, location.search);
    pending.current = taken.pending;
    if (taken.ours) return;
    callbacks.current.apply(location.search);
  }, [identity, location.search]);

  useEffect(() => {
    const now = latest.current;
    const expected = pending.current.at(-1) ?? now.search;
    const next = callbacks.current.plan(expected);
    if (next === null) return;
    pending.current = [...pending.current, next];
    void navigate({ pathname: now.pathname, search: next }, { replace: true, state: now.state });
  }, [identity, trigger, navigate]);
}

/**
 * 화면이 replace로 쓴 URL이 뒤늦게 location으로 돌아왔는지 가린다. pending은 쓴 순서대로의 search 목록이다.
 * 목록에 있으면(ours) 그 항목까지 비우고 상태는 이미 그 이후 값이므로 URL→상태 반영을 건너뛴다(연타 중 늦게 온 중간 URL이 상태를 되돌리지 않게).
 * 목록에 없으면 바깥에서 온 이동이므로 목록을 비우고 반영한다.
 */
export function takeWrittenSearch(pending: readonly string[], search: string): { ours: boolean; pending: string[] } {
  const index = pending.indexOf(search);
  if (index < 0) return { ours: false, pending: [] };
  return { ours: true, pending: pending.slice(index + 1) };
}
