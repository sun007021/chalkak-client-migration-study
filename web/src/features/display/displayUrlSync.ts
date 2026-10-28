import type { DateString } from '../../core/time/kst';
import { parseDisplayRoute } from './displayDates';
import type { DisplaySort } from './displayDates';

/**
 * 상태(날짜·정렬) → URL 쓰기 계획. 이미 그 값을 가리키는 URL이면 null(기본값 오늘·최신순은 파라미터가 없는 URL도 같은 뜻이다).
 * 아니면 date·sort를 덮어쓴 새 search(`?date=…&sort=…`, 다른 파라미터는 유지)를 돌려준다.
 */
export function planUrlWrite(search: string, target: { date: DateString; sort: DisplaySort; today: DateString }): string | null {
  const route = parseDisplayRoute(search);
  if ((route.date ?? target.today) === target.date && (route.sort ?? 'recent') === target.sort) return null;
  const params = new URLSearchParams(search);
  params.set('date', target.date);
  params.set('sort', target.sort);
  return `?${params.toString()}`;
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
