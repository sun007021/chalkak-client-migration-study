import { windowToCropRect } from './CropGeometry';
import type { RgbaImage, Size } from './ImageTypes';
import type { PhotoEdit } from './PhotoEdit';
import { effectiveAdjustValues } from './PhotoAdjustmentLayers';
import { createPixelTransform, type Rgba } from './PhotoColorTransform';
import { rotatedSize } from './PhotoEditTransform';

/** 편집값의 자르기를 돌린 사진의 픽셀 사각형으로 푼다(경계에 맞게 정수로 맞춘다). 네이티브 자르기도 같은 값을 쓴다. */
export function cropPixelRect(
  source: Size,
  edit: Pick<PhotoEdit, 'quarterTurns' | 'crop'>,
): { x0: number; y0: number; width: number; height: number } {
  const rotated = rotatedSize(source, edit.quarterTurns);
  const rect = windowToCropRect(edit.crop, edit.quarterTurns);
  const x0 = Math.max(
    0,
    Math.min(rotated.width - 1, Math.round((rect.centerX - rect.width / 2) * rotated.width)),
  );
  const y0 = Math.max(
    0,
    Math.min(rotated.height - 1, Math.round((rect.centerY - rect.height / 2) * rotated.height)),
  );
  return {
    x0,
    y0,
    width: Math.max(1, Math.min(rotated.width - x0, Math.round(rect.width * rotated.width))),
    height: Math.max(1, Math.min(rotated.height - y0, Math.round(rect.height * rotated.height))),
  };
}

/** 색(조정·필터)을 바꾸는 편집인가. 아니면 회전·자르기만 하는 편집이라 네이티브 도구만으로 끝낼 수 있다. */
export function hasColorEdit(edit: Pick<PhotoEdit, 'filter' | 'adjustments'>): boolean {
  return (
    edit.filter !== 'original' ||
    Object.values(effectiveAdjustValues(edit.adjustments)).some((value) => value !== 0)
  );
}

/**
 * 순수 TS 기준 렌더러: 회전 -> 자르기(기하) -> 색 조정 -> 필터 순서(REQ-EDIT-008)로 픽셀 버퍼를 만든다.
 * 네이티브 파이프라인과 같은 결과여야 하는 기준이자, 작은 분석 표본·썸네일을 만드는 데 쓴다.
 */
export function renderPixels(image: RgbaImage, edit: PhotoEdit): RgbaImage {
  const { x0, y0, width: outW, height: outH } = cropPixelRect(image, edit);
  const transform = createPixelTransform(effectiveAdjustValues(edit.adjustments), edit.filter);
  const data = new Uint8ClampedArray(outW * outH * 4);
  for (let j = 0; j < outH; j += 1) {
    for (let i = 0; i < outW; i += 1) {
      const xr = x0 + i;
      const yr = y0 + j;
      let sx = xr;
      let sy = yr;
      switch (edit.quarterTurns) {
        case 1:
          sx = yr;
          sy = image.height - 1 - xr;
          break;
        case 2:
          sx = image.width - 1 - xr;
          sy = image.height - 1 - yr;
          break;
        case 3:
          sx = image.width - 1 - yr;
          sy = xr;
          break;
        default:
      }
      const s = (sy * image.width + sx) * 4;
      const out: Rgba = transform([
        image.data[s],
        image.data[s + 1],
        image.data[s + 2],
        image.data[s + 3],
      ]);
      data.set(out, (j * outW + i) * 4);
    }
  }
  return { width: outW, height: outH, data };
}
