import type { RgbaImage } from './ImageTypes';
import type { AdjustValues } from './PhotoEdit';

/**
 * 자동 보정값 분석(REQ-EDIT-026). 노출 -> 블랙 포인트 -> 그림자·하이라이트·대비 -> 채도 순서로 정하고
 * 따뜻함은 정하지 않는다(0). 각 값은 소수 둘째 자리로 반올림(0.5는 0에서 먼 쪽).
 */
export function analyzeAutoAdjust(sample: RgbaImage): AdjustValues {
  void sample;
  throw new Error('not implemented');
}
