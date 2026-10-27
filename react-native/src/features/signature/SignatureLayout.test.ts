import { SIGNATURE_PNG_SIZE } from '../../shared/constants';
import { fitStrokesToPng } from './SignatureLayout';
import type { Point, Stroke } from './Stroke';

const spec = SIGNATURE_PNG_SIZE; // 1024x512, padding 48, strokeWidth 14
// 기존 앱의 그리기 영역은 정사각형이다(Android aspectRatio(1f)). 정사각형이면 비율 좌표 정규화가 픽셀 비율을 유지한다.
const canvas = { width: 300, height: 300 };
const { width: W, height: H, padding: P } = spec;
const all = (strokes: readonly Stroke[]): Point[] => strokes.flatMap((s) => [...s]);
const bounds = (points: Point[]) => ({
  minX: Math.min(...points.map((p) => p.x)),
  maxX: Math.max(...points.map((p) => p.x)),
  minY: Math.min(...points.map((p) => p.y)),
  maxY: Math.max(...points.map((p) => p.y)),
});

describe('fitStrokesToPng', () => {
  it('TC-SIGN-011 한쪽 끝에 몰린 획도 패딩 48px 안쪽 영역에 들어가고 중앙에 놓인다', () => {
    const fitted = fitStrokesToPng(
      [
        [
          { x: 5, y: 5 },
          { x: 60, y: 30 },
        ],
      ],
      canvas,
      spec,
    );
    const b = bounds(all(fitted));
    expect(b.minX).toBeGreaterThanOrEqual(P - 1e-6);
    expect(b.maxX).toBeLessThanOrEqual(W - P + 1e-6);
    expect(b.minY).toBeGreaterThanOrEqual(P - 1e-6);
    expect(b.maxY).toBeLessThanOrEqual(H - P + 1e-6);
    expect((b.minX + b.maxX) / 2).toBeCloseTo(W / 2, 3);
    expect((b.minY + b.maxY) / 2).toBeCloseTo(H / 2, 3);
  });

  it('TC-SIGN-011 비율을 유지하고 제한 축이 패딩 영역을 가득 채운다', () => {
    // 가로로 긴 박스(100x20): 가로가 제한 축 -> 가로 폭이 W-2P, 세로는 비율대로.
    const fitted = fitStrokesToPng(
      [
        [
          { x: 10, y: 10 },
          { x: 110, y: 30 },
        ],
      ],
      canvas,
      spec,
    );
    const b = bounds(all(fitted));
    expect(b.maxX - b.minX).toBeCloseTo(W - 2 * P, 3);
    expect((b.maxY - b.minY) / (b.maxX - b.minX)).toBeCloseTo(20 / 100, 4);
  });

  it('TC-SIGN-011 세로로 긴 박스는 세로가 H-2P를 채운다', () => {
    const fitted = fitStrokesToPng(
      [
        [
          { x: 100, y: 10 },
          { x: 110, y: 140 },
        ],
      ],
      canvas,
      spec,
    );
    const b = bounds(all(fitted));
    expect(b.maxY - b.minY).toBeCloseTo(H - 2 * P, 3);
  });

  it('TC-SIGN-011 점 하나는 폭주하지 않고, 최소 박스(0.02 -> 416x416)를 가운데에 둔 뒤 그 왼쪽 위 모서리에 놓인다(원본 동작)', () => {
    // 근거: Android/iOS SignaturePngEncoder. 배율 = min(928/0.02, 416/0.02) = 20800,
    // offsetX = (1024-0.02*20800)/2 = 304, offsetY = (512-416)/2 = 48 -> 점은 (304, 48).
    const fitted = fitStrokesToPng([[{ x: 77, y: 33 }]], canvas, spec);
    expect(fitted).toEqual([[{ x: 304, y: 48 }]]);
  });

  it('TC-SIGN-011 직선(가로/세로 한 변이 0)도 최소 정규화 크기 0.02로 취급해 NaN·무한대가 없다', () => {
    const horizontal = fitStrokesToPng(
      [
        [
          { x: 20, y: 70 },
          { x: 200, y: 70 },
        ],
      ],
      canvas,
      spec,
    );
    const b = bounds(all(horizontal));
    for (const p of all(horizontal)) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
    expect(b.maxX - b.minX).toBeCloseTo(W - 2 * P, 3);
    expect(b.maxY - b.minY).toBeCloseTo(0, 6);
    // 원본: 세로 박스를 0.02로 올려(= 0.02 * 배율 높이) 가운데에 두고 선은 그 위쪽 변에 놓인다.
    const scale = (W - 2 * P) / 0.6;
    expect(b.minY).toBeCloseTo((H - 0.02 * scale) / 2, 3);
  });

  it('TC-SIGN-011 박스 한 변이 캔버스의 0.02보다 작으면 0.02로 취급한다(1x1px 박스 -> 배율 20800)', () => {
    // 비율 박스 0.00333 -> 양 변 모두 0.02로 올림 -> 배율 min(928/0.02, 416/0.02) = 20800. 실제 점 간격은 0.00333*20800.
    const fitted = fitStrokesToPng(
      [
        [
          { x: 100, y: 70 },
          { x: 101, y: 71 },
        ],
      ],
      canvas,
      spec,
    );
    const b = bounds(all(fitted));
    expect(b.maxX - b.minX).toBeCloseTo((1 / 300) * 20800, 2);
    expect(b.maxY - b.minY).toBeCloseTo((1 / 300) * 20800, 2);
    expect(b.minX).toBeCloseTo(304, 2);
    expect(b.minY).toBeCloseTo(48, 2);
  });

  it('TC-SIGN-011 좌표는 캔버스 크기로 나눈 비율로 정규화한다(가로로 긴 캔버스에서도 박스가 패딩 안쪽)', () => {
    const wide = { width: 600, height: 150 };
    const fitted = fitStrokesToPng(
      [
        [
          { x: 0, y: 0 },
          { x: 600, y: 150 },
        ],
      ],
      wide,
      spec,
    );
    const b = bounds(all(fitted));
    // 비율 박스 1x1 -> 배율 min(928, 416) = 416 -> 416x416 정사각형으로 가운데.
    expect(b.maxX - b.minX).toBeCloseTo(416, 3);
    expect(b.maxY - b.minY).toBeCloseTo(416, 3);
    expect((b.minX + b.maxX) / 2).toBeCloseTo(W / 2, 3);
  });

  it('REQ-SIGN-007 여러 획의 상대 위치와 점 개수를 보존한다', () => {
    const input: Stroke[] = [
      [
        { x: 10, y: 10 },
        { x: 50, y: 40 },
        { x: 90, y: 20 },
      ],
      [{ x: 200, y: 100 }],
    ];
    const fitted = fitStrokesToPng(input, canvas, spec);
    expect(fitted.map((s) => s.length)).toEqual([3, 1]);
    // x 순서 보존
    expect(fitted[0][0].x).toBeLessThan(fitted[0][1].x);
    expect(fitted[0][1].x).toBeLessThan(fitted[0][2].x);
    expect(fitted[0][2].x).toBeLessThan(fitted[1][0].x);
  });

  it('REQ-SIGN-007 입력을 바꾸지 않는다', () => {
    const input: Stroke[] = [[{ x: 10, y: 10 }]];
    const copy = JSON.stringify(input);
    fitStrokesToPng(input, canvas, spec);
    expect(JSON.stringify(input)).toBe(copy);
  });
});

describe('fitStrokesToPng: 입력 방어', () => {
  it('유한하지 않은 점은 버리고 나머지로 정규화한다(NaN이 번지지 않는다)', () => {
    const fitted = fitStrokesToPng(
      [
        [
          { x: 10, y: 10 },
          { x: NaN, y: 50 },
          { x: 110, y: 30 },
        ],
        [{ x: Infinity, y: 1 }],
      ],
      canvas,
      spec,
    );
    expect(fitted).toHaveLength(1);
    expect(fitted[0]).toHaveLength(2);
    for (const p of fitted[0]) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });

  it('유한한 점이 하나도 없으면 빈 배열이다', () => {
    expect(fitStrokesToPng([[{ x: NaN, y: NaN }]], canvas, spec)).toEqual([]);
  });

  it('점이 수십만 개여도 spread 인자 한도에 걸리지 않는다', () => {
    const big: Stroke = Array.from({ length: 300_000 }, (_, i) => ({ x: i % 300, y: i % 150 }));
    expect(() => fitStrokesToPng([big], canvas, spec)).not.toThrow();
  });
});
