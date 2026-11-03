import type { PhotoEdit, PhotoFilter } from '../editModel';
import { applyAdjustments, effectiveValues, isZeroAdjustments } from './adjustments';
import type { AdjustmentValues } from './adjustments';
import { applyFilter } from './filters';

export interface ColorParams {
  adjustments: AdjustmentValues;
  filter: PhotoFilter;
}

/** 색 연산이 필요한가(조정이 하나라도 0이 아니거나 필터가 원본이 아님). */
export function hasColorEffect(params: ColorParams): boolean {
  return !isZeroAdjustments(params.adjustments) || params.filter !== 'original';
}

/** 편집값에서 색 연산 인자를 뽑는다(조정은 effectiveValues). */
export function colorParamsOf(edit: PhotoEdit): ColorParams {
  return { adjustments: effectiveValues(edit.adjustmentLayers), filter: edit.filter };
}

/** RGBA 버퍼에 제자리로 적용: 조정(선형 → 저장 → 톤 곡선) → 필터(REQ-EDIT-008). 알파 채널은 필터 행렬이 정한 대로. */
export function applyColorPipeline(pixels: Uint8ClampedArray, params: ColorParams): void {
  applyAdjustments(pixels, params.adjustments);
  applyFilter(pixels, params.filter);
}
