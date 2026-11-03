import type { PhotoEdit, PhotoFilter } from '../editModel';
import type { AdjustmentValues } from './adjustments';

export interface ColorParams {
  adjustments: AdjustmentValues;
  filter: PhotoFilter;
}

/** 색 연산이 필요한가(조정이 하나라도 0이 아니거나 필터가 원본이 아님). */
export function hasColorEffect(_params: ColorParams): boolean {
  throw new Error('not implemented');
}

/** 편집값에서 색 연산 인자를 뽑는다(조정은 effectiveValues). */
export function colorParamsOf(_edit: PhotoEdit): ColorParams {
  throw new Error('not implemented');
}

/** RGBA 버퍼에 제자리로 적용: 조정(선형 → 저장 → 톤 곡선) → 필터(REQ-EDIT-008). 알파 채널은 필터 행렬이 정한 대로. */
export function applyColorPipeline(_pixels: Uint8ClampedArray, _params: ColorParams): void {
  throw new Error('not implemented');
}
