/** 조정 눈금자: 단위(1.0)당 400dp, 눈금 50개, 10개마다 굵은 눈금(플랫폼 허용 차이의 Android 기준). */
export const RULER_DP_PER_UNIT = 400;
export const RULER_TICKS_PER_UNIT = 50;
export const RULER_MAJOR_TICK_EVERY = 10;

export function valueToOffsetDp(value: number): number {
  return value * RULER_DP_PER_UNIT;
}

/** 위치 -> 값. 범위 밖 끌기는 -1~1 끝에서 멈춘다. */
export function offsetDpToValue(offsetDp: number): number {
  return Math.min(1, Math.max(-1, offsetDp / RULER_DP_PER_UNIT));
}

/** 눈금 i(0이 가운데, 음수는 왼쪽)의 값. */
export function tickValue(index: number): number {
  return index / RULER_TICKS_PER_UNIT;
}

export function isMajorTick(index: number): boolean {
  return index % RULER_MAJOR_TICK_EVERY === 0;
}

/** 기준값(0과 자동 보정 몫) 근처에서 멈칫한다: `rangeUnits` 안이면 가장 가까운 기준값, 아니면 그대로. */
export function applyDetent(value: number, anchors: readonly number[], rangeUnits: number): number {
  let best: number | null = null;
  let bestDistance = Infinity;
  for (const anchor of anchors) {
    const distance = Math.abs(value - anchor);
    if (distance <= rangeUnits && distance < bestDistance) {
      best = anchor;
      bestDistance = distance;
    }
  }
  return best ?? value;
}
