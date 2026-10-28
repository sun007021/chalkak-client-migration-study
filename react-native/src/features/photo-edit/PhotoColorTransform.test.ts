import { PHOTO_FILTERS, filterMatrix } from './PhotoFilters';
import {
  applyColorMatrix,
  buildToneCurve,
  photoEditConstants,
  toneCurveValue,
  transformPixel,
  type Rgba,
} from './PhotoColorTransform';
import type { PhotoFilter } from './PhotoEdit';
import {
  loadFiltersFile,
  maxChannelDiff,
  oracleTransform,
  withValues,
  zeroValues,
} from './__testing__/colorOracle';

const gray = (v: number): Rgba => [v, v, v, 255];
const channelsClose = (actual: Rgba, expected: readonly number[], tolerance: number) => {
  for (let i = 0; i < expected.length; i += 1) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(tolerance);
  }
};

describe('조정: 선형 단계(노출·따뜻함·채도)', () => {
  it('TC-EDIT-024 회색 128에 노출 +1, +0.5, -1이면 약 205, 162, 78이다(+-2)', () => {
    channelsClose(
      transformPixel(gray(128), withValues({ exposure: 1 }), 'original'),
      [205, 205, 205],
      2,
    );
    channelsClose(
      transformPixel(gray(128), withValues({ exposure: 0.5 }), 'original'),
      [162, 162, 162],
      2,
    );
    channelsClose(
      transformPixel(gray(128), withValues({ exposure: -1 }), 'original'),
      [78, 78, 78],
      2,
    );
  });

  it('TC-EDIT-024 노출 0이면 128 그대로다', () => {
    expect(transformPixel(gray(128), zeroValues(), 'original')).toEqual([128, 128, 128, 255]);
  });

  it('TC-EDIT-025 회색 128에 따뜻함 +1이면 R~142, G=128, B~112, -1이면 R~112, B~142다(+-2)', () => {
    const warm = transformPixel(gray(128), withValues({ warmth: 1 }), 'original');
    channelsClose(warm, [142, 128, 112], 2);
    const cool = transformPixel(gray(128), withValues({ warmth: -1 }), 'original');
    channelsClose(cool, [112, 128, 142], 2);
  });

  it('TC-EDIT-026 (200,50,50)에 채도 -1이면 R=G=B~107, +1이면 (255,0,0), 0이면 변화 없다', () => {
    const pixel: Rgba = [200, 50, 50, 255];
    const desat = transformPixel(pixel, withValues({ saturation: -1 }), 'original');
    channelsClose(desat, [107, 107, 107], 2);
    expect(desat[0]).toBe(desat[1]);
    expect(desat[1]).toBe(desat[2]);
    expect(transformPixel(pixel, withValues({ saturation: 1 }), 'original')).toEqual([
      255, 0, 0, 255,
    ]);
    expect(transformPixel(pixel, zeroValues(), 'original')).toEqual(pixel);
  });

  it('조정 단계는 알파를 바꾸지 않는다', () => {
    const out = transformPixel(
      [100, 120, 140, 77],
      withValues({ exposure: 0.5, warmth: 0.3 }),
      'original',
    );
    expect(out[3]).toBe(77);
  });
});

describe('톤 곡선', () => {
  const curve = (tone: Partial<ReturnType<typeof zeroValues>>) => buildToneCurve(withValues(tone));

  it('TC-EDIT-027 대비 +1: t=0.25 -> 0.1545, 0.5 -> 0.5, 0.75 -> 0.8455 (+-0.01)', () => {
    const table = curve({ contrast: 1 });
    expect(table).toHaveLength(256);
    expect(Math.abs(toneCurveValue(table, 0.25) - 0.1545)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(toneCurveValue(table, 0.5) - 0.5)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(toneCurveValue(table, 0.75) - 0.8455)).toBeLessThanOrEqual(0.01);
  });

  it('TC-EDIT-027 그림자 +1: 1/3 -> 0.4815, 하이라이트 +1: 2/3 -> 0.8148 (+-0.01)', () => {
    expect(Math.abs(toneCurveValue(curve({ shadows: 1 }), 1 / 3) - 0.4815)).toBeLessThanOrEqual(
      0.01,
    );
    expect(Math.abs(toneCurveValue(curve({ highlights: 1 }), 2 / 3) - 0.8148)).toBeLessThanOrEqual(
      0.01,
    );
  });

  it('TC-EDIT-027 블랙 포인트 -1에서 검정은 약 0.3까지 뜨고, +1에서 밝기 0.3 아래는 0이다', () => {
    expect(Math.abs(toneCurveValue(curve({ blackPoint: -1 }), 0) - 0.3)).toBeLessThanOrEqual(0.01);
    const lifted = curve({ blackPoint: 1 });
    expect(toneCurveValue(lifted, 0.29)).toBeCloseTo(0, 6);
    expect(toneCurveValue(lifted, 0.1)).toBeCloseTo(0, 6);
    expect(toneCurveValue(lifted, 1)).toBeCloseTo(1, 6);
  });

  it('TC-EDIT-028 (-1, 0, 1)^4 모든 조합에서 곡선은 1로 끝나고 줄어들지 않는다(시작은 0.3 x max(-블랙 포인트, 0))', () => {
    const values = [-1, 0, 1];
    for (const blackPoint of values) {
      for (const shadows of values) {
        for (const highlights of values) {
          for (const contrast of values) {
            const table = curve({ blackPoint, shadows, highlights, contrast });
            expect(table).toHaveLength(256);
            expect(table[0]).toBeCloseTo(0.3 * Math.max(-blackPoint, 0), 6);
            expect(table[255]).toBeCloseTo(1, 6);
            for (let i = 1; i < 256; i += 1) {
              expect(table[i]).toBeGreaterThanOrEqual(table[i - 1] - 1e-12);
            }
          }
        }
      }
    }
  });
});

describe('파이프라인 순서와 필터', () => {
  it('TC-EDIT-029 모든 조정 0, 필터 원본이면 모든 픽셀이 변하지 않는다', () => {
    for (let v = 0; v < 256; v += 1) {
      expect(transformPixel(gray(v), zeroValues(), 'original')).toEqual(gray(v));
    }
    for (const pixel of [
      [255, 0, 0, 255],
      [12, 200, 77, 255],
      [3, 3, 250, 128],
    ] as Rgba[]) {
      expect(transformPixel(pixel, zeroValues(), 'original')).toEqual(pixel);
    }
  });

  it.each([
    [{ exposure: 0.5 }, 'vintage'],
    [{ contrast: 0.4, shadows: 0.5 }, 'mono'],
    [{ highlights: -0.5, saturation: 0.5, warmth: -0.3 }, 'warm'],
    [{ blackPoint: 0.2, exposure: -0.4, saturation: -0.5 }, 'cool'],
    [{ blackPoint: -0.2, shadows: 0.3, contrast: -0.4, warmth: 0.5 }, 'vivid'],
    [{ exposure: 0.3, saturation: 0.4 }, 'original'],
  ] as [Partial<ReturnType<typeof zeroValues>>, PhotoFilter][])(
    'TC-EDIT-029 조정 %j + 필터 %s는 선형 -> 감마 -> 톤 곡선 -> 필터 행렬 순서의 기준 구현과 +-1 안에서 같다',
    (patch, filter) => {
      const values = withValues(patch);
      const pixels: Rgba[] = [
        [0, 0, 0, 255],
        [255, 255, 255, 255],
        [128, 128, 128, 255],
        [200, 100, 50, 255],
        [30, 160, 220, 255],
        [90, 40, 200, 200],
      ];
      for (const pixel of pixels) {
        const actual = transformPixel(pixel, values, filter);
        expect(maxChannelDiff(actual, oracleTransform(pixel, values, filter))).toBeLessThanOrEqual(
          1,
        );
      }
    },
  );

  it('TC-EDIT-036 상수가 filters.json과 같다', () => {
    expect(photoEditConstants()).toEqual(loadFiltersFile().constants);
  });

  it('TC-EDIT-039 필터는 원본, 흑백, 따뜻하게, 차갑게, 빈티지, 선명하게 6종이 이 순서이고 행렬(20개 값)이 filters.json과 같다', () => {
    expect([...PHOTO_FILTERS]).toEqual(['original', 'mono', 'warm', 'cool', 'vintage', 'vivid']);
    const file = loadFiltersFile();
    expect(file.filters.map((f) => f.id)).toEqual([...PHOTO_FILTERS]);
    for (const { id, matrix } of file.filters) {
      const actual = filterMatrix(id);
      if (matrix === null) expect(actual).toBeNull();
      else {
        expect(actual).toHaveLength(20);
        expect([...(actual as readonly number[])]).toEqual(matrix);
      }
    }
  });

  it('TC-EDIT-039 빈티지 행렬은 문서 표의 값이다(파일과 문서가 어긋나지 않는다)', () => {
    expect([...(filterMatrix('vintage') as readonly number[])]).toEqual([
      0.63, 0.35, 0.09, 0, 18, 0.16, 0.76, 0.08, 0, 14, 0.12, 0.24, 0.51, 0, 10, 0, 0, 0, 1, 0,
    ]);
  });

  it('TC-EDIT-040 필터 원본은 단위 행렬이라 모든 픽셀이 변하지 않는다', () => {
    for (const pixel of [gray(0), gray(77), [255, 10, 99, 255], [1, 2, 3, 40]] as Rgba[]) {
      expect(transformPixel(pixel, zeroValues(), 'original')).toEqual(pixel);
    }
  });

  it('TC-EDIT-041 흑백 필터는 어떤 색에서도 R=G=B이고 알파는 그대로다', () => {
    const colors: Rgba[] = [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [12, 200, 77, 255],
      [250, 249, 3, 90],
      [101, 102, 103, 255],
    ];
    for (const pixel of colors) {
      const out = transformPixel(pixel, zeroValues(), 'mono');
      expect(out[0]).toBe(out[1]);
      expect(out[1]).toBe(out[2]);
      expect(out[3]).toBe(pixel[3]);
    }
  });

  it('TC-EDIT-042 회색 128에서 따뜻하게는 R>B, 차갑게는 B>R이다', () => {
    const warm = transformPixel(gray(128), zeroValues(), 'warm');
    expect(warm[0]).toBeGreaterThan(warm[2]);
    expect(warm.slice(0, 3)).toEqual([146, 135, 113]);
    const cool = transformPixel(gray(128), zeroValues(), 'cool');
    expect(cool[2]).toBeGreaterThan(cool[0]);
    expect(cool.slice(0, 3)).toEqual([115, 130, 151]);
  });

  it('TC-EDIT-043 고정 색 패치에 빈티지·선명하게를 적용한 값이 손으로 계산한 값과 +-2 이내다', () => {
    // 빈티지: R'=0.63R+0.35G+0.09B+18, G'=0.16R+0.76G+0.08B+14, B'=0.12R+0.24G+0.51B+10
    channelsClose(transformPixel([200, 100, 50, 255], zeroValues(), 'vintage'), [184, 126, 84], 2);
    channelsClose(transformPixel([0, 0, 0, 255], zeroValues(), 'vintage'), [18, 14, 10], 2);
    channelsClose(
      transformPixel([255, 255, 255, 255], zeroValues(), 'vintage'),
      [255, 255, 232],
      2,
    );
    // 선명하게: R'=1.2754R-0.2503G-0.0252B, G'=-0.0746R+1.0997G-0.0252B, B'=-0.0746R-0.2503G+1.3248B
    channelsClose(transformPixel([200, 100, 50, 255], zeroValues(), 'vivid'), [229, 94, 26], 2);
    channelsClose(transformPixel([255, 0, 0, 255], zeroValues(), 'vivid'), [255, 0, 0], 2);
    channelsClose(transformPixel([128, 128, 128, 255], zeroValues(), 'vivid'), [128, 128, 128], 3);
  });

  it('TC-EDIT-044 조정이 없을 때 transformPixel의 필터는 4x5 행렬 적용(applyColorMatrix)과 +-1 이내로 같다', () => {
    for (const filter of PHOTO_FILTERS) {
      const matrix = filterMatrix(filter);
      for (const pixel of [gray(128), [200, 100, 50, 255], [10, 240, 130, 180]] as Rgba[]) {
        const expected = matrix ? applyColorMatrix(pixel, matrix) : pixel;
        expect(
          maxChannelDiff(transformPixel(pixel, zeroValues(), filter), expected),
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it('applyColorMatrix는 결과를 반올림해 0~255로 자른다', () => {
    const vivid = filterMatrix('vivid') as readonly number[];
    expect(applyColorMatrix([255, 0, 0, 255], vivid)).toEqual([255, 0, 0, 255]);
    expect(applyColorMatrix([0, 255, 0, 255], vivid)).toEqual([0, 255, 0, 255]);
    const warm = filterMatrix('warm') as readonly number[];
    expect(applyColorMatrix([250, 250, 250, 255], warm)).toEqual([255, 255, 220, 255]);
  });
});
