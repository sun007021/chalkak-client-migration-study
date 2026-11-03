import { IDENTITY_EDIT } from '../editModel';
import type { PhotoEdit } from '../editModel';
import { applyColorPipeline, colorParamsOf, hasColorEffect } from './colorPipeline';
import { ZERO_ADJUSTMENTS_FOR_TEST as ZERO } from '../../../test/adjustmentValues';
import { expectRgbNear, pixelAt, solid } from '../../../test/pixels';

describe('색 파이프라인 (REQ-EDIT-008: 조정 → 필터)', () => {
  it('TC-EDIT-029 조정이 없고 필터가 원본이면 모든 픽셀이 그대로고 색 연산이 필요 없다', () => {
    const buffer = solid(2, 2, [10, 200, 90, 255]);
    applyColorPipeline(buffer, { adjustments: ZERO, filter: 'original' });
    expect(pixelAt(buffer, 0)).toEqual([10, 200, 90, 255]);
    expect(hasColorEffect({ adjustments: ZERO, filter: 'original' })).toBe(false);
    expect(hasColorEffect({ adjustments: { ...ZERO, saturation: 0.1 }, filter: 'original' })).toBe(true);
    expect(hasColorEffect({ adjustments: ZERO, filter: 'mono' })).toBe(true);
  });

  it('TC-EDIT-029 필터는 조정을 마친 값에 적용된다: 회색 100에 블랙 포인트 +1 → 34, 그 다음 따뜻하게 → (45, 39, 30)', () => {
    // 조정: x = 100/255 = 0.392 → (0.392 − 0.3)/0.7 = 0.1317 → 33.6 ≈ 34. 필터: R = 1.08·34 + 8 = 44.7, G = 1.02·34 + 4 = 38.7, B = 0.88·34 = 29.9
    // 순서를 바꿔 필터를 먼저 적용하면 (116, 106, 88) → 블랙 포인트 +1 → (56, 42, 16)이 되어 B가 14 다르다.
    const buffer = solid(1, 1, [100, 100, 100, 255]);
    applyColorPipeline(buffer, { adjustments: { ...ZERO, blackPoint: 1 }, filter: 'warm' });
    expectRgbNear(pixelAt(buffer, 0), [45, 39, 30], 2);
  });

  it('TC-EDIT-046 노출 +0.5 → 흑백 순서: 회색 128은 162 회색이 된다', () => {
    const buffer = solid(1, 1, [128, 128, 128, 255]);
    applyColorPipeline(buffer, { adjustments: { ...ZERO, exposure: 0.5 }, filter: 'mono' });
    expectRgbNear(pixelAt(buffer, 0), [162, 162, 162], 2);
  });

  it('colorParamsOf는 조정의 유효값(직접 값 우선, 아니면 자동값 × 강도)과 필터를 뽑는다', () => {
    const edit: PhotoEdit = {
      ...IDENTITY_EDIT,
      filter: 'cool',
      adjustmentLayers: { autoValues: { ...IDENTITY_EDIT.adjustmentLayers.autoValues, exposure: 0.4, contrast: 0.2 }, autoStrength: 0.5, manual: { exposure: 0.3 } },
    };
    const params = colorParamsOf(edit);
    expect(params.filter).toBe('cool');
    expect(params.adjustments.exposure).toBeCloseTo(0.3, 12);
    expect(params.adjustments.contrast).toBeCloseTo(0.1, 12);
    expect(params.adjustments.saturation).toBe(0);
  });
});
