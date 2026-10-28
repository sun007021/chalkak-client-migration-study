import { windowToCropRect } from './CropGeometry';
import type { RgbaImage, Size } from './ImageTypes';
import type { PhotoEdit } from './PhotoEdit';
import { effectiveAdjustValues } from './PhotoAdjustmentLayers';
import { createPixelRunner } from './PhotoColorTransform';
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
  // 오른쪽·아래 끝 좌표를 먼저 반올림하고 크기는 그 차로 구한다(왼쪽 반올림 오차가 크기에 겹치지 않게).
  const x1 = Math.min(
    rotated.width,
    Math.max(x0 + 1, Math.round((rect.centerX + rect.width / 2) * rotated.width)),
  );
  const y1 = Math.min(
    rotated.height,
    Math.max(y0 + 1, Math.round((rect.centerY + rect.height / 2) * rotated.height)),
  );
  return { x0, y0, width: x1 - x0, height: y1 - y0 };
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
  const job = createRenderJob(image, edit);
  job.renderRows(0, job.height);
  return job.result();
}

/** 줄 단위로 나누어 칠할 수 있는 렌더 작업(긴 작업 사이에 이벤트 루프를 양보하려고). */
export type RenderJob = {
  width: number;
  height: number;
  /** [from, to) 줄을 칠한다. */
  renderRows(from: number, to: number): void;
  result(): RgbaImage;
};

export function createRenderJob(image: RgbaImage, edit: PhotoEdit): RenderJob {
  const { x0, y0, width: outW, height: outH } = cropPixelRect(image, edit);
  const run = createPixelRunner(effectiveAdjustValues(edit.adjustments), edit.filter);
  const data = new Uint8ClampedArray(outW * outH * 4);
  const src = image.data;
  const { quarterTurns } = edit;
  return {
    width: outW,
    height: outH,
    renderRows(from, to) {
      for (let j = from; j < to; j += 1) {
        for (let i = 0; i < outW; i += 1) {
          const xr = x0 + i;
          const yr = y0 + j;
          let sx = xr;
          let sy = yr;
          if (quarterTurns === 1) {
            sx = yr;
            sy = image.height - 1 - xr;
          } else if (quarterTurns === 2) {
            sx = image.width - 1 - xr;
            sy = image.height - 1 - yr;
          } else if (quarterTurns === 3) {
            sx = image.width - 1 - yr;
            sy = xr;
          }
          run(src, (sy * image.width + sx) * 4, data, (j * outW + i) * 4);
        }
      }
    },
    result: () => ({ width: outW, height: outH, data }),
  };
}
