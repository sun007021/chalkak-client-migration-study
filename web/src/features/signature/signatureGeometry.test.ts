import { SIGNATURE_PNG_SIZE } from '../../constants';
import { buildSignatureCommands, clientToPad, hasSignature, layoutStrokes, smoothPath } from './signatureGeometry';
import type { DrawCommand } from './signatureGeometry';
import type { PadPoint, SignatureDrawing } from './SignaturePad';

const W = SIGNATURE_PNG_SIZE.width;
const H = SIGNATURE_PNG_SIZE.height;
const PAD = SIGNATURE_PNG_SIZE.padding;
const SPEC = { width: W, height: H, padding: PAD, strokeWidth: SIGNATURE_PNG_SIZE.strokeWidth };
const EPS = 0.5;

const pts = (...xy: [number, number][]): PadPoint[] => xy.map(([x, y]) => ({ x, y }));
const drawing = (...strokes: [number, number][][]): SignatureDrawing => ({ width: 400, height: 200, strokes: strokes.map((s) => pts(...s)) });
const layout = (d: SignatureDrawing) => layoutStrokes(d, { width: W, height: H, padding: PAD });

function bounds(strokes: PadPoint[][]) {
  const all = strokes.flat();
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe('hasSignature', () => {
  it('TC-SIGN-003 획이 없거나 점이 없는 빈 획뿐이면 false다', () => {
    expect(hasSignature([])).toBe(false);
    expect(hasSignature([[], []])).toBe(false);
  });
  it('TC-SIGN-004 점이 하나라도 있는 획이 있으면 true다', () => {
    expect(hasSignature([[], pts([1, 1])])).toBe(true);
  });
});

describe('clientToPad', () => {
  const size = { width: 1024, height: 512 };
  it('요소 상자 안의 위치를 패드 좌표로 비례 환산한다(CSS 크기와 논리 크기가 달라도)', () => {
    expect(clientToPad({ x: 250, y: 130 }, { left: 50, top: 30, width: 400, height: 200 }, size)).toEqual({ x: (200 / 400) * 1024, y: (100 / 200) * 512 });
  });
  it('상자 왼쪽 위는 (0,0), 오른쪽 아래는 (width,height)이다', () => {
    const rect = { left: 10, top: 20, width: 512, height: 256 };
    expect(clientToPad({ x: 10, y: 20 }, rect, size)).toEqual({ x: 0, y: 0 });
    expect(clientToPad({ x: 522, y: 276 }, rect, size)).toEqual({ x: 1024, y: 512 });
  });
  it('상자 밖 좌표는 보정하지 않고 그대로 환산한다(보정은 SignaturePad가 한다)', () => {
    expect(clientToPad({ x: -50, y: 0 }, { left: 0, top: 0, width: 512, height: 256 }, size).x).toBe(-100);
  });
  it('요소 크기가 0이면 (0,0)이다(NaN을 만들지 않는다)', () => {
    expect(clientToPad({ x: 5, y: 5 }, { left: 0, top: 0, width: 0, height: 0 }, size)).toEqual({ x: 0, y: 0 });
  });
});

describe('layoutStrokes (REQ-SIGN-007)', () => {
  it('TC-SIGN-011 사인이 없으면 빈 배열이다', () => {
    expect(layout(drawing())).toEqual([]);
    expect(layout(drawing([]))).toEqual([]);
  });

  it('TC-SIGN-011 한쪽 모서리에 몰린 획도 패딩 48px 안쪽에 맞춘다', () => {
    const b = bounds(layout(drawing([[0, 0], [40, 20], [80, 10]])));
    expect(b.minX).toBeGreaterThanOrEqual(PAD - EPS);
    expect(b.maxX).toBeLessThanOrEqual(W - PAD + EPS);
    expect(b.minY).toBeGreaterThanOrEqual(PAD - EPS);
    expect(b.maxY).toBeLessThanOrEqual(H - PAD + EPS);
  });

  it('TC-SIGN-011 박스는 비율을 유지한 채 영역을 최대한 채우고 중앙 정렬된다(가로로 긴 박스)', () => {
    const b = bounds(layout(drawing([[100, 90], [300, 140]])));
    expect(b.minX).toBeCloseTo(PAD, 0);
    expect(b.maxX).toBeCloseTo(W - PAD, 0);
    expect((b.maxX - b.minX) / (b.maxY - b.minY)).toBeCloseTo(200 / 50 / 1, 1);
    expect((b.minY + b.maxY) / 2).toBeCloseTo(H / 2, 0);
  });

  it('TC-SIGN-011 세로로 긴 박스는 세로를 채우고 가로로 중앙 정렬된다', () => {
    const b = bounds(layout(drawing([[190, 10], [210, 190]])));
    expect(b.minY).toBeCloseTo(PAD, 0);
    expect(b.maxY).toBeCloseTo(H - PAD, 0);
    expect((b.minX + b.maxX) / 2).toBeCloseTo(W / 2, 0);
  });

  it('TC-SIGN-011 획이 여러 개여도 전체 외곽 박스를 기준으로 맞춘다', () => {
    const strokes = layout(drawing([[20, 20], [60, 60]], [[300, 150], [380, 180]]));
    expect(strokes).toHaveLength(2);
    const b = bounds(strokes);
    expect(b.minX).toBeCloseTo(PAD, 0);
    expect(b.maxX).toBeCloseTo(W - PAD, 0);
    expect(b.minY).toBeGreaterThanOrEqual(PAD - EPS);
    expect(b.maxY).toBeLessThanOrEqual(H - PAD + EPS);
  });

  it('TC-SIGN-011 빈 획은 결과에서 빠지고 나머지 획의 점 개수·순서는 유지된다', () => {
    const strokes = layout(drawing([], [[10, 10], [20, 30], [50, 40]]));
    expect(strokes).toHaveLength(1);
    expect(strokes[0]).toHaveLength(3);
    expect(strokes[0]![0]!.x).toBeLessThan(strokes[0]![1]!.x);
    expect(strokes[0]![1]!.x).toBeLessThan(strokes[0]![2]!.x);
  });

  it('TC-SIGN-011 수평 직선도 NaN·무한대 없이 영역을 가로지르고 세로 중앙에 놓인다', () => {
    const all = layout(drawing([[50, 100], [350, 100]])).flat();
    for (const p of all) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    const b = bounds(layout(drawing([[50, 100], [350, 100]])));
    expect(b.minX).toBeCloseTo(PAD, 0);
    expect(b.maxX).toBeCloseTo(W - PAD, 0);
    expect(b.minY).toBeCloseTo(H / 2, 0);
    expect(b.maxY).toBeCloseTo(H / 2, 0);
  });

  it('TC-SIGN-011 수직 직선도 폭주하지 않고 세로 영역을 채운다', () => {
    const b = bounds(layout(drawing([[200, 10], [200, 190]])));
    expect(b.minY).toBeCloseTo(PAD, 0);
    expect(b.maxY).toBeCloseTo(H - PAD, 0);
    expect(b.minX).toBeCloseTo(W / 2, 0);
  });

  it('TC-SIGN-002 TC-SIGN-011 점 하나는 영역 중앙에 놓인다', () => {
    const strokes = layout(drawing([[10, 10]]));
    expect(strokes).toHaveLength(1);
    expect(strokes[0]).toHaveLength(1);
    expect(strokes[0]![0]!.x).toBeCloseTo(W / 2, 0);
    expect(strokes[0]![0]!.y).toBeCloseTo(H / 2, 0);
  });

  it('TC-SIGN-011 같은 점을 반복해 찍어도(크기 0 박스) 유한한 좌표이고 중앙에 놓인다', () => {
    for (const p of layout(drawing([[30, 30], [30, 30], [30, 30]])).flat()) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(p.x).toBeCloseTo(W / 2, 0);
      expect(p.y).toBeCloseTo(H / 2, 0);
    }
  });

  it('TC-SIGN-011 박스 한 변이 캔버스의 0.02 미만이면 0.02로 취급한다(거의 평평한 획은 가로 기준으로만 맞춘다)', () => {
    const b = bounds(layout(drawing([[50, 100], [350, 101]])));
    expect(b.minX).toBeCloseTo(PAD, 0);
    expect(b.maxX).toBeCloseTo(W - PAD, 0);
    expect(b.maxY - b.minY).toBeLessThan(10);
    expect((b.minY + b.maxY) / 2).toBeCloseTo(H / 2, 0);
  });

  it('입력의 캔버스 크기가 PNG와 달라도(400×200) 같은 비율의 장면은 같은 결과가 나온다', () => {
    const small = layout({ width: 400, height: 200, strokes: [pts([100, 50], [300, 150])] });
    const large = layout({ width: 800, height: 400, strokes: [pts([200, 100], [600, 300])] });
    expect(small[0]![0]!.x).toBeCloseTo(large[0]![0]!.x, 3);
    expect(small[0]![1]!.y).toBeCloseTo(large[0]![1]!.y, 3);
  });
});

describe('smoothPath', () => {
  it('점 2개는 move + line이다', () => {
    expect(smoothPath(pts([0, 0], [10, 10]))).toEqual([
      { op: 'move', x: 0, y: 0 },
      { op: 'line', x: 10, y: 10 },
    ]);
  });

  it('TC-SIGN-012 점 3개 이상은 중간 점을 제어점으로 다음 점과의 중점까지 이차 곡선으로 잇고 마지막 점으로 line한다', () => {
    expect(smoothPath(pts([0, 0], [10, 10], [20, 0], [30, 10]))).toEqual([
      { op: 'move', x: 0, y: 0 },
      { op: 'quad', cx: 10, cy: 10, x: 15, y: 5 },
      { op: 'quad', cx: 20, cy: 0, x: 25, y: 5 },
      { op: 'line', x: 30, y: 10 },
    ]);
  });

  it('점 3개는 quad 한 번 + line이다', () => {
    expect(smoothPath(pts([0, 0], [10, 10], [20, 0]))).toEqual([
      { op: 'move', x: 0, y: 0 },
      { op: 'quad', cx: 10, cy: 10, x: 15, y: 5 },
      { op: 'line', x: 20, y: 0 },
    ]);
  });
});

describe('buildSignatureCommands', () => {
  it('사인이 없으면 빈 배열이다', () => {
    expect(buildSignatureCommands(drawing(), SPEC)).toEqual([]);
  });

  it('TC-SIGN-002 점 하나뿐인 획은 반지름 7(획 두께 14의 절반)의 원(dot)이고 PNG 중앙에 놓인다', () => {
    const [cmd] = buildSignatureCommands(drawing([[10, 10]]), SPEC);
    expect(cmd).toMatchObject({ kind: 'dot', radius: 7 });
    expect((cmd as Extract<DrawCommand, { kind: 'dot' }>).x).toBeCloseTo(W / 2, 0);
    expect((cmd as Extract<DrawCommand, { kind: 'dot' }>).y).toBeCloseTo(H / 2, 0);
  });

  it('획마다 명령 하나이고 순서는 획 순서이며 경로는 layoutStrokes 좌표를 smoothPath로 잇는다', () => {
    const d = drawing([[20, 20], [60, 60], [100, 40]], [[300, 150]]);
    const cmds = buildSignatureCommands(d, SPEC);
    expect(cmds.map((c) => c.kind)).toEqual(['stroke', 'dot']);
    const laid = layout(d);
    expect(cmds[0]).toEqual({ kind: 'stroke', ops: smoothPath(laid[0]!) });
  });

  it('점이 같은 두 개 이상인 획은 dot이 아니라 stroke다(둥근 끝으로 점이 보인다)', () => {
    const [cmd] = buildSignatureCommands(drawing([[30, 30], [30, 30]]), SPEC);
    expect(cmd!.kind).toBe('stroke');
  });

  it('모든 좌표는 패딩 안쪽 영역에 들어간다', () => {
    const cmds = buildSignatureCommands(drawing([[0, 0], [400, 200]]), SPEC);
    const xs: number[] = [];
    for (const c of cmds) {
      if (c.kind === 'dot') xs.push(c.x);
      else for (const op of c.ops) xs.push(op.x);
    }
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(PAD - EPS);
    expect(Math.max(...xs)).toBeLessThanOrEqual(W - PAD + EPS);
  });
});
