import type { RecordState, RecordViewModel } from './RecordViewModel';

const NOT_IMPLEMENTED = 'not implemented';

/**
 * 기록 URL(`?date=`)과 ViewModel 선택 날짜를 맞춘다(전시의 useDisplayUrlSync와 같은 구조).
 * - URL → 상태: 마운트·Link·주소 변경은 applyRoute로 반영한다.
 * - 상태 → URL: 선택 날짜가 바뀌면 planRecordUrlWrite 결과를 replace로 쓴다(location.state 보존). 쓴 search는 pending에 쌓고 뒤늦게 돌아오는 그 URL은 반영을 건너뛴다(takeWrittenSearch).
 */
export function useRecordUrlSync(_vm: RecordViewModel, _state: Pick<RecordState, 'selectedDate'>): void {
  throw new Error(NOT_IMPLEMENTED);
}
