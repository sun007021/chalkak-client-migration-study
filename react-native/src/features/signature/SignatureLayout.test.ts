import { SIGNATURE_PNG_SIZE } from '../../shared/constants';
import { fitStrokesToPng } from './SignatureLayout';
import type { Point, Stroke } from './Stroke';

const spec = SIGNATURE_PNG_SIZE; // 1024x512, padding 48, strokeWidth 14
const canvas = { width: 300, height: 150 };
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

  it('TC-SIGN-011 점 하나는 정확히 중앙에 놓이고 폭주하지 않는다', () => {
    const fitted = fitStrokesToPng([[{ x: 77, y: 33 }]], canvas, spec);
    expect(fitted).toEqual([[{ x: W / 2, y: H / 2 }]]);
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
    expect((b.minY + b.maxY) / 2).toBeCloseTo(H / 2, 3);
  });

  it('TC-SIGN-011 박스 한 변이 캔버스의 0.02보다 작으면 0.02로 취급한다(최소 박스 6x3px -> 배율 min(928/6, 416/3))', () => {
    // [가정: 확인 필요 1] 박스를 캔버스 픽셀로 보고 각 변을 max(변, 0.02*캔버스 변)로 올린 뒤 비율 유지로 패딩 영역에 맞춘다.
    // 1x1px 박스: 가로 최소 6px, 세로 최소 3px -> 배율 = min(928/6, 416/3) = 138.667 -> 결과 크기 138.667x138.667.
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
    const scale = Math.min((W - 2 * P) / 6, (H - 2 * P) / 3);
    expect(b.maxX - b.minX).toBeCloseTo(scale, 2);
    expect(b.maxY - b.minY).toBeCloseTo(scale, 2);
    expect((b.minX + b.maxX) / 2).toBeCloseTo(W / 2, 2);
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
