import type { RgbaImage } from './ImageTypes';
import { identityEdit, type PhotoEdit } from './PhotoEdit';
import { renderPixels } from './PhotoPixelRenderer';
import type { Rgba } from './PhotoColorTransform';
import { maxChannelDiff, oracleTransform, withValues, zeroValues } from './__testing__/colorOracle';

/** 4x4: R=40x+20, G=40y+20, B=100. */
function patch(): RgbaImage {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) data.set([40 * x + 20, 40 * y + 20, 100, 255], (y * 4 + x) * 4);
  }
  return { width: 4, height: 4, data };
}
const at = (image: RgbaImage, x: number, y: number): Rgba => {
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
};

describe('기준 렌더러', () => {
  it('REQ-EDIT-005 편집하지 않은 사진은 픽셀이 그대로다', () => {
    const out = renderPixels(patch(), identityEdit());
    expect(out.width).toBe(4);
    expect(out.height).toBe(4);
    expect([...out.data]).toEqual([...patch().data]);
  });

  it('REQ-EDIT-002 자르기 중심은 회전 전 원본 비율이다: 가운데 50% 자르기는 안쪽 2x2 픽셀이다', () => {
    const edit: PhotoEdit = {
      ...identityEdit(),
      crop: { centerX: 0.5, centerY: 0.5, width: 0.5, height: 0.5 },
    };
    const out = renderPixels(patch(), edit);
    expect([out.width, out.height]).toEqual([2, 2]);
    expect(at(out, 0, 0)).toEqual(at(patch(), 1, 1));
    expect(at(out, 1, 1)).toEqual(at(patch(), 2, 2));
  });

  it('TC-EDIT-046 크롭·회전·흑백·노출을 조합한 4x4 입력의 출력 크기와 픽셀이 기대 골든과 같다(+-1)', () => {
    // 1회전 후 돌린 사진의 왼쪽 절반(2x4). 돌린 점 (xr, yr)은 원본 (yr, H - xr)로 돌아간다.
    const edit: PhotoEdit = {
      ...identityEdit(),
      quarterTurns: 1,
      crop: { centerX: 0.5, centerY: 0.75, width: 0.5, height: 1 },
      filter: 'mono',
      adjustments: { auto: zeroValues(), autoStrength: 0, user: { exposure: 0.5 } },
    };
    const source = patch();
    const out = renderPixels(source, edit);
    expect([out.width, out.height]).toEqual([2, 4]);
    for (let j = 0; j < 4; j += 1) {
      for (let i = 0; i < 2; i += 1) {
        const original = at(source, j, 3 - i);
        const expected = oracleTransform(original, withValues({ exposure: 0.5 }), 'mono');
        expect(maxChannelDiff(at(out, i, j), expected)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('REQ-EDIT-008 처리 순서는 기하 -> 색 조정 -> 필터다: 회전·자르기는 색을 바꾸지 않는다', () => {
    const turned: PhotoEdit = { ...identityEdit(), quarterTurns: 2 };
    const out = renderPixels(patch(), turned);
    expect(at(out, 0, 0)).toEqual(at(patch(), 3, 3));
    expect(at(out, 3, 3)).toEqual(at(patch(), 0, 0));
  });
});
