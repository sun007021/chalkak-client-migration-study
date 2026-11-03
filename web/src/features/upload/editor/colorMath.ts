/** sRGB 변환·반올림(upload-edit.md 부록 'sRGB 변환과 처리 순서', '자동 보정 식'). 입력·출력은 0~1. */

/** 저장 값(0~1) → 선형. x ≤ 0.04045 이면 x / 12.92, 아니면 ((x + 0.055) / 1.055)^2.4. */
export function srgbToLinear(_x: number): number {
  throw new Error('not implemented');
}

/** 선형 → 저장 값(0~1). x ≤ 0.0031308 이면 12.92x, 아니면 1.055 × x^(1/2.4) − 0.055. */
export function linearToSrgb(_x: number): number {
  throw new Error('not implemented');
}

/** 소수 둘째 자리 반올림. sign(v) × floor(|v| × 100 + 0.5) / 100 (0.5는 0에서 먼 쪽). */
export function round2(_v: number): number {
  throw new Error('not implemented');
}
