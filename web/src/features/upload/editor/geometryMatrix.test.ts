import { geometryMatrix, planGeometry, rectToCropRegion, rotatedPointToSource, rotatedSize } from './cropGeometry';
import type { QuarterTurns } from './cropGeometry';
import { keyboardAdjustDisplay } from './adjustments';

const PHOTO = { width: 400, height: 300 };

describe('geometryMatrix: 원본 좌표 → 표면 좌표 (실제 canvas 그리기 변환, 픽셀은 Playwright가 확인)', () => {
  it('원본 점을 돌린 사진의 점으로 보내고 rotatedRect 원점을 뺀 값이다(rotatedPointToSource의 역)', () => {
    for (const turns of [0, 1, 2, 3] as QuarterTurns[]) {
      const crop = rectToCropRegion(PHOTO, turns, { centerX: 0.4, centerY: 0.6, width: 0.5, height: 0.5 });
      const plan = planGeometry(PHOTO, { quarterTurns: turns, crop });
      const [a, b, c, d, e, f] = geometryMatrix(PHOTO, plan);
      const rotated = rotatedSize(PHOTO, turns);
      // 돌린 사진의 점 (xr, yr) → 원본 점 → 행렬 → rotatedRect 기준 점이 되어야 한다.
      for (const [xr, yr] of [
        [10, 20],
        [rotated.width - 5, rotated.height / 2],
      ] as const) {
        const source = rotatedPointToSource(PHOTO, turns, { x: xr, y: yr });
        expect(a * source.x + c * source.y + e, `turns ${turns} x`).toBeCloseTo(xr - plan.rotatedRect.x, 9);
        expect(b * source.x + d * source.y + f, `turns ${turns} y`).toBeCloseTo(yr - plan.rotatedRect.y, 9);
      }
    }
  });

  it('출력 크기가 rotatedRect와 다르면(미리보기 축소) 그만큼 배율이 곱해진다', () => {
    const plan = planGeometry(PHOTO, { quarterTurns: 0, crop: { centerX: 0.5, centerY: 0.5, width: 1, height: 1 } });
    expect(geometryMatrix(PHOTO, { ...plan, output: { width: 200, height: 150 } })).toEqual([0.5, 0, 0, 0.5, 0, 0]);
  });
});

describe('keyboardAdjustDisplay: 슬라이더 키보드 (REQ-EDIT-019)', () => {
  it('←↓ -1, →↑ +1, PageDown -10, PageUp +10, Home -100, End +100이고 범위를 넘지 않는다', () => {
    expect(keyboardAdjustDisplay(5, 'ArrowLeft')).toBe(4);
    expect(keyboardAdjustDisplay(5, 'ArrowDown')).toBe(4);
    expect(keyboardAdjustDisplay(5, 'ArrowRight')).toBe(6);
    expect(keyboardAdjustDisplay(5, 'ArrowUp')).toBe(6);
    expect(keyboardAdjustDisplay(5, 'PageDown')).toBe(-5);
    expect(keyboardAdjustDisplay(5, 'PageUp')).toBe(15);
    expect(keyboardAdjustDisplay(5, 'Home')).toBe(-100);
    expect(keyboardAdjustDisplay(5, 'End')).toBe(100);
    expect(keyboardAdjustDisplay(100, 'ArrowRight')).toBe(100);
    expect(keyboardAdjustDisplay(-95, 'PageDown')).toBe(-100);
    expect(keyboardAdjustDisplay(5, 'a')).toBeNull();
  });
});
