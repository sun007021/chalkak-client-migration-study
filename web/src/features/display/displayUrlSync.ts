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

// 공용 훅(core/ui/useSearchSync)으로 옮겼다. 기존 import 경로를 유지한다.
export { takeWrittenSearch } from '../../core/ui/useSearchSync';
