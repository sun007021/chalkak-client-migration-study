import type { KstDate } from '../../core/time/KstDate';

/** 전시 날짜 이동·선택 범위: [최초 전시일(D-12), KST 오늘]. */
export type DateRange = { min: KstDate; max: KstDate };

/** 휠에 나오는 연도(오름차순). */
export function availableYears(_range: DateRange): number[] {
  throw new Error('not implemented');
}

/** 해당 연도에서 고를 수 있는 월(1~12). 첫 해는 min 월 이후, 마지막 해는 max 월까지. */
export function availableMonths(_range: DateRange, _year: number): number[] {
  throw new Error('not implemented');
}

/** 해당 연월에서 고를 수 있는 일. 첫 달은 min 일부터, 마지막 달은 max 일까지, 사이 달은 말일까지. */
export function availableDays(_range: DateRange, _year: number, _month: number): number[] {
  throw new Error('not implemented');
}

/** 범위 밖이면 가장 가까운 끝으로 맞춘다. */
export function clampToRange(_date: KstDate, _range: DateRange): KstDate {
  throw new Error('not implemented');
}

/** 휠에서 고른 연·월·일을 날짜로. 그 달에 없는 일(2월 30일)은 말일로, 범위 밖이면 끝으로 맞춘다. */
export function resolvePickedDate(
  _range: DateRange,
  _year: number,
  _month: number,
  _day: number,
): KstDate {
  throw new Error('not implemented');
}

/** 헤더 접힘 진행도: 스크롤 오프셋 / 접힘 거리를 0~1로 clamp(위로 스크롤하면 줄어든다). */
export function collapseProgress(_scrollOffset: number, _collapseDistance: number): number {
  throw new Error('not implemented');
}
