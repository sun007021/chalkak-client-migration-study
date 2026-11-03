import type { ReactNode } from 'react';

const NOT_IMPLEMENTED = 'not implemented';

/**
 * 기록 탭 화면(W3 자리표시를 대체한다). 로직은 RecordViewModel에 있고 여기서는 그리기만 한다.
 * container.recordSession(mode)의 ViewModel에 붙어서 navigator를 꽂고, useRecordUrlSync·onShown/onHidden(문서 가시성 포함)·탭 재선택 구독·useScreenView('record')를 맡는다.
 */
export function RecordScreen(): ReactNode {
  throw new Error(NOT_IMPLEMENTED);
}
