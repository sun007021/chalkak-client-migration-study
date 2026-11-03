import { PHOTO_FILTERS } from '../editModel';
import { applyFilter, filterMatrix } from './filters';
import { applyColorPipeline } from './colorPipeline';
import { ZERO_ADJUSTMENTS_FOR_TEST } from '../../../test/adjustmentValues';
import { expectRgbNear, grayRamp, pixelAt, pixelsOf, seededRandom, solid } from '../../../test/pixels';
import type { Rgba } from '../../../test/pixels';

// 부록 '필터 4×5 행렬'의 표를 그대로 옮긴 기대값. shared/photo-edit/filters.json이 아직 없어 이 표가 근거다.
const SPEC_MATRICES = {
  mono: [
    [0.299, 0.587, 0.114, 0, 0],
    [0.299, 0.587, 0.114, 0, 0],
    [0.299, 0.587, 0.114, 0, 0],
    [0, 0, 0, 1, 0],
  ],
  warm: [
    [1.08, 0, 0, 0, 8],
    [0, 1.02, 0, 0, 4],
    [0, 0, 0.88, 0, 0],
    [0, 0, 0, 1, 0],
  ],
  cool: [
    [0.9, 0, 0, 0, 0],
    [0, 1, 0, 0, 2],
    [0, 0, 1.1, 0, 10],
    [0, 0, 0, 1, 0],
  ],
  vintage: [
    [0.63, 0.35, 0.09, 0, 18],
    [0.16, 0.76, 0.08, 0, 14],
    [0.12, 0.24, 0.51, 0, 10],
    [0, 0, 0, 1, 0],
  ],
  vivid: [
    [1.2754, -0.2503, -0.0252, 0, 0],
    [-0.0746, 1.0997, -0.0252, 0, 0],
    [-0.0746, -0.2503, 1.3248, 0, 0],
    [0, 0, 0, 1, 0],
  ],
} as const;

describe('필터 (REQ-EDIT-028, 029)', () => {
  it('TC-EDIT-039 필터는 원본, 흑백, 따뜻하게, 차갑게, 빈티지, 선명하게 6종이 이 순서다', () => {
    expect([...PHOTO_FILTERS]).toEqual(['original', 'mono', 'warm', 'cool', 'vintage', 'vivid']);
  });

  it('TC-EDIT-039 각 필터의 4×5 행렬 20개 값이 부록 표와 같다(원본은 적용 안 함)', () => {
    expect(filterMatrix('original')).toBeNull();
    for (const [name, expected] of Object.entries(SPEC_MATRICES)) {
      const matrix = filterMatrix(name as keyof typeof SPEC_MATRICES);
      expect(matrix, name).not.toBeNull();
      expect(matrix!.map((row) => [...row])).toEqual(expected.map((row) => [...row]));
    }
  });

  it('TC-EDIT-040 원본 필터는 단위 행렬이라 모든 픽셀이 변하지 않는다', () => {
    const ramp = grayRamp();
    const before = Uint8ClampedArray.from(ramp);
    applyFilter(ramp, 'original');
    expect([...ramp]).toEqual([...before]);
    const rnd = seededRandom(7);
    const noise = new Uint8ClampedArray(4 * 64).map(() => Math.floor(rnd() * 256));
    const copy = Uint8ClampedArray.from(noise);
    applyFilter(noise, 'original');
    expect([...noise]).toEqual([...copy]);
  });

  it('TC-EDIT-040 필터를 적용해도 버퍼 길이(= 이미지 크기)는 그대로다', () => {
    const buffer = solid(5, 3, [10, 20, 30, 255]);
    applyFilter(buffer, 'warm');
    expect(buffer.length).toBe(5 * 3 * 4);
  });

  it('TC-EDIT-041 흑백 필터는 임의 색 모든 픽셀에서 R=G=B이고 알파는 그대로다', () => {
    const rnd = seededRandom(41);
    const buffer = new Uint8ClampedArray(4 * 200).map(() => Math.floor(rnd() * 256));
    for (let i = 3; i < buffer.length; i += 4) buffer[i] = 200;
    applyFilter(buffer, 'mono');
    for (let i = 0; i < 200; i += 1) {
      const [r, g, b, a] = pixelAt(buffer, i);
      expect(r).toBe(g);
      expect(g).toBe(b);
      expect(a).toBe(200);
    }
  });

  it('TC-EDIT-041 흑백 값은 0.299R + 0.587G + 0.114B 이다 (200,100,50) → 124, (10,240,120) → 158', () => {
    // 0.299·200 + 0.587·100 + 0.114·50 = 59.8 + 58.7 + 5.7 = 124.2 → 124
    // 0.299·10 + 0.587·240 + 0.114·120 = 2.99 + 140.88 + 13.68 = 157.55 → 158 (±1은 반올림 방식 차이)
    const buffer = pixelsOf([
      [200, 100, 50, 255],
      [10, 240, 120, 255],
    ]);
    applyFilter(buffer, 'mono');
    expectRgbNear(pixelAt(buffer, 0), [124, 124, 124], 1);
    expectRgbNear(pixelAt(buffer, 1), [158, 158, 158], 1);
  });

  it('TC-EDIT-042 회색 128에서 따뜻하게는 R>B, 차갑게는 B>R이다', () => {
    // 따뜻하게: R = 1.08·128 + 8 = 146.24 → 146, G = 1.02·128 + 4 = 134.56 → 135, B = 0.88·128 = 112.64 → 113
    // 차갑게:   R = 0.9·128 = 115.2 → 115,      G = 128 + 2 = 130,            B = 1.1·128 + 10 = 150.8 → 151
    const warm = solid(1, 1, [128, 128, 128, 255]);
    applyFilter(warm, 'warm');
    expectRgbNear(pixelAt(warm, 0), [146, 135, 113], 1);
    expect(warm[0]!).toBeGreaterThan(warm[2]!);
    const cool = solid(1, 1, [128, 128, 128, 255]);
    applyFilter(cool, 'cool');
    expectRgbNear(pixelAt(cool, 0), [115, 130, 151], 1);
    expect(cool[2]!).toBeGreaterThan(cool[0]!);
  });

  // 4×4 패치: 아래 8가지 색을 두 번씩. 기대값은 행렬 표를 손으로 곱한 값이다(반올림 후 0~255로 자름).
  const PATCH: readonly Rgba[] = [
    [128, 128, 128, 255],
    [200, 100, 50, 255],
    [10, 240, 120, 255],
    [0, 0, 0, 255],
    [255, 255, 255, 255],
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 128],
  ];
  const patch = () => pixelsOf([...PATCH, ...PATCH]);

  it('TC-EDIT-043 빈티지 필터의 4×5 패치 출력이 골든 값과 ±2 이내다', () => {
    // 빈티지 행: R = .63R+.35G+.09B+18, G = .16R+.76G+.08B+14, B = .12R+.24G+.51B+10
    // (128,128,128) → (155,142,121) / (200,100,50) → (184,126,84) / (10,240,120) → (119,208,130) / (0,0,0) → (18,14,10)
    // (255,255,255) → R 1.07·255+18 → 255, G 1.0·255+14 → 255, B 0.87·255+10 = 231.85 → 232
    // (255,0,0) → (178.65, 54.8, 40.6) = (179, 55, 41) / (0,255,0) → (107.25, 207.8, 71.2) = (107, 208, 71) / (0,0,255) → (40.95, 34.4, 140.05) = (41, 34, 140)
    const expected: [number, number, number][] = [
      [155, 142, 121],
      [184, 126, 84],
      [119, 208, 130],
      [18, 14, 10],
      [255, 255, 232],
      [179, 55, 41],
      [107, 208, 71],
      [41, 34, 140],
    ];
    const buffer = patch();
    applyFilter(buffer, 'vintage');
    for (let i = 0; i < 16; i += 1) expectRgbNear(pixelAt(buffer, i), expected[i % 8]!, 2);
    expect(pixelAt(buffer, 7)[3]).toBe(128);
  });

  it('TC-EDIT-043 선명하게 필터의 4×5 패치 출력이 골든 값과 ±2 이내다', () => {
    // 선명하게 행: R = 1.2754R−.2503G−.0252B, G = −.0746R+1.0997G−.0252B, B = −.0746R−.2503G+1.3248B
    // (128,128,128) → (128,128,128) (각 행 합 ≈ 1) / (200,100,50) → (229,94,26) / (10,240,120) → R −59.9 → 0, G 262.8−… 아래 계산대로 (0,255,98)
    //   G: −.0746·10 + 1.0997·240 − .0252·120 = −0.746 + 263.93 − 3.02 = 260.2 → 255(자름), B: −.746 − 60.07 + 158.98 = 98.2 → 98
    // (0,0,0) → (0,0,0) / (255,255,255) → (255,255,255)(합 0.9999 → 254.97)
    // (255,0,0) → (325.2→255, 0(−19.0→0), 0(−19.0→0)) / (0,255,0) → (0, 280→255, 0) / (0,0,255) → (0, 0, 337.8→255)
    const expected: [number, number, number][] = [
      [128, 128, 128],
      [229, 94, 26],
      [0, 255, 98],
      [0, 0, 0],
      [255, 255, 255],
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
    ];
    const buffer = patch();
    applyFilter(buffer, 'vivid');
    for (let i = 0; i < 16; i += 1) expectRgbNear(pixelAt(buffer, i), expected[i % 8]!, 2);
  });

  it('TC-EDIT-044 조정이 없는 색 파이프라인 경로는 필터만 적용한 결과와 ±1 이내로 같다', () => {
    const rnd = seededRandom(44);
    for (const filter of PHOTO_FILTERS) {
      const a = new Uint8ClampedArray(4 * 100).map(() => Math.floor(rnd() * 256));
      const b = Uint8ClampedArray.from(a);
      applyFilter(a, filter);
      applyColorPipeline(b, { adjustments: ZERO_ADJUSTMENTS_FOR_TEST, filter });
      for (let i = 0; i < a.length; i += 1) expect(Math.abs(a[i]! - b[i]!), `${filter} @${i}`).toBeLessThanOrEqual(1);
    }
  });
});
