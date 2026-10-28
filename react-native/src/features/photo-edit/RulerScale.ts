/** 조정 눈금자: 단위(1.0)당 400dp, 눈금 50개, 10개마다 굵은 눈금(플랫폼 허용 차이의 Android 기준). */
export const RULER_DP_PER_UNIT = 400;
export const RULER_TICKS_PER_UNIT = 50;
export const RULER_MAJOR_TICK_EVERY = 10;

export function valueToOffsetDp(value: number): number {
  void value;
  throw new Error('not implemented');
}

export function offsetDpToValue(offsetDp: number): number {
  void offsetDp;
  throw new Error('not implemented');
}

/** 눈금 i(0이 가운데, 음수는 왼쪽)의 값. */
export function tickValue(index: number): number {
  void index;
  throw new Error('not implemented');
}

export function isMajorTick(index: number): boolean {
  void index;
  throw new Error('not implemented');
}

/** 기준값(0과 자동 보정 몫) 근처에서 멈칫한다: `rangeUnits` 안이면 가장 가까운 기준값, 아니면 그대로. */
export function applyDetent(value: number, anchors: readonly number[], rangeUnits: number): number {
  void value;
  void anchors;
  void rangeUnits;
  throw new Error('not implemented');
}
