/** 눈금자 수치(TC-EDIT-038). 웹 슬라이더 모양은 자유(허용 차이)이지만 눈금·디텐트 계산은 같은 기준을 쓴다. */

/** 값 1.0당 화면 길이(dp/px). */
export const RULER_UNITS_PER_VALUE = 400;
/** 값 1.0당 눈금 수. 10번째마다 굵은 눈금. */
export const RULER_TICKS_PER_VALUE = 50;
export const RULER_MAJOR_TICK_EVERY = 10;
/** 기준값(0, 자동 보정 몫) 근처에서 멈칫하는 범위(값 단위). 임시: 기존 Android 값을 문서에서 확인하지 못했다. */
export const RULER_DETENT_RANGE = 0.03;

/** 값 → 눈금자 위치(0이 기준 0) = value × 400. */
export function valueToOffset(value: number): number {
  return value * RULER_UNITS_PER_VALUE;
}
export function offsetToValue(offset: number): number {
  return offset / RULER_UNITS_PER_VALUE;
}

/** 값 → 가장 가까운 눈금 번호(0이 기준) = round(value × 50). */
export function tickIndex(value: number): number {
  const index = Math.round(value * RULER_TICKS_PER_VALUE);
  return index === 0 ? 0 : index;
}
export function isMajorTick(index: number): boolean {
  return index % RULER_MAJOR_TICK_EVERY === 0;
}

/** value가 anchors 중 하나에서 range 이내이면 그 anchor로 붙이고(가장 가까운 것), 아니면 그대로. */
export function snapToDetent(value: number, anchors: readonly number[], range: number = RULER_DETENT_RANGE): number {
  let best = value;
  let bestDistance = Infinity;
  for (const anchor of anchors) {
    const distance = Math.abs(value - anchor);
    if (distance <= range + 1e-9 && distance < bestDistance) {
      best = anchor;
      bestDistance = distance;
    }
  }
  return best;
}
