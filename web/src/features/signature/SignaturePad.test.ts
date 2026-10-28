import { SignaturePad } from './SignaturePad';
import type { PadPoint } from './SignaturePad';

const SIZE = { width: 1024, height: 512 };
const pts = (...xy: [number, number][]): PadPoint[] => xy.map(([x, y]) => ({ x, y }));

function drawn(...strokes: [number, number][][]): SignaturePad {
  const pad = new SignaturePad(SIZE);
  for (const s of strokes) pad.addStroke(pts(...s));
  return pad;
}

describe('SignaturePad', () => {
  it('TC-SIGN-001 처음에는 획이 없어 사인 없음·되돌리기 불가이다', () => {
    const pad = new SignaturePad(SIZE);
    expect(pad.state).toEqual({ strokes: [], hasSignature: false, canUndo: false, drawing: false });
  });

  it('TC-SIGN-002 점 하나만 찍어도 사인이 있는 것으로 본다(획 하나, 점 하나)', () => {
    const pad = new SignaturePad(SIZE);
    pad.beginStroke({ x: 100, y: 80 });
    pad.endStroke();
    expect(pad.state.hasSignature).toBe(true);
    expect(pad.state.strokes).toEqual([[{ x: 100, y: 80 }]]);
  });

  it('TC-SIGN-003 점이 없는 빈 획은 만들지 않아 사인이 없는 것으로 취급한다', () => {
    const pad = new SignaturePad(SIZE);
    pad.addStroke([]);
    expect(pad.state.strokes).toEqual([]);
    expect(pad.state.hasSignature).toBe(false);
    expect(pad.state.canUndo).toBe(false);
  });

  it('TC-SIGN-004 포인트가 있는 획이면 사인이 있고 되돌리기 가능하다', () => {
    const pad = drawn([[10, 10], [20, 20]]);
    expect(pad.state).toMatchObject({ hasSignature: true, canUndo: true, drawing: false });
  });

  it('REQ-SIGN-002 begin → extend → end로 연속 획을 모으고 그리는 중에는 drawing이 true이다', () => {
    const pad = new SignaturePad(SIZE);
    pad.beginStroke({ x: 10, y: 10 });
    expect(pad.state.drawing).toBe(true);
    pad.extendStroke({ x: 20, y: 15 });
    pad.extendStroke({ x: 30, y: 20 });
    pad.endStroke();
    expect(pad.state.drawing).toBe(false);
    pad.beginStroke({ x: 200, y: 100 });
    pad.extendStroke({ x: 210, y: 110 });
    pad.endStroke();
    expect(pad.state.strokes).toEqual([pts([10, 10], [20, 15], [30, 20]), pts([200, 100], [210, 110])]);
  });

  it('그리는 중이 아닐 때 extendStroke·endStroke는 무시한다', () => {
    const pad = drawn([[1, 1]]);
    pad.extendStroke({ x: 50, y: 50 });
    pad.endStroke();
    expect(pad.state.strokes).toEqual([pts([1, 1])]);
  });

  it('획을 끝내지 않고 새로 시작하면 이전 획은 그대로 남고 새 획이 시작된다', () => {
    const pad = new SignaturePad(SIZE);
    pad.beginStroke({ x: 1, y: 1 });
    pad.beginStroke({ x: 9, y: 9 });
    pad.extendStroke({ x: 10, y: 10 });
    pad.endStroke();
    expect(pad.state.strokes).toEqual([pts([1, 1]), pts([9, 9], [10, 10])]);
  });

  it('TC-SIGN-005 캔버스 밖 좌표(음수, 경계 초과)는 영역 안으로 보정한다', () => {
    const pad = new SignaturePad(SIZE);
    pad.beginStroke({ x: -30, y: -5 });
    pad.extendStroke({ x: 5000, y: 100 });
    pad.extendStroke({ x: 500, y: 9999 });
    pad.endStroke();
    expect(pad.state.strokes).toEqual([pts([0, 0], [1024, 100], [500, 512])]);
    pad.addStroke(pts([-1, 600]));
    expect(pad.state.strokes[1]).toEqual(pts([0, 512]));
  });

  it('TC-SIGN-005 경계값(0, width, height)은 그대로 둔다', () => {
    const pad = drawn([[0, 0], [1024, 512]]);
    expect(pad.state.strokes[0]).toEqual(pts([0, 0], [1024, 512]));
  });

  it('유한하지 않은 좌표(NaN, Infinity)는 무시한다', () => {
    const pad = new SignaturePad(SIZE);
    pad.beginStroke({ x: Number.NaN, y: 1 });
    expect(pad.state.strokes).toEqual([]);
    expect(pad.state.drawing).toBe(false);
    pad.beginStroke({ x: 1, y: 1 });
    pad.extendStroke({ x: Number.POSITIVE_INFINITY, y: 2 });
    pad.extendStroke({ x: 2, y: Number.NaN });
    pad.endStroke();
    expect(pad.state.strokes).toEqual([pts([1, 1])]);
  });

  it('TC-SIGN-006 획이 3개일 때 되돌리기 3회는 마지막 획부터 하나씩 지우고 0개가 되면 사인 없음·되돌리기 불가이다', () => {
    const pad = drawn([[1, 1], [2, 2]], [[3, 3], [4, 4]], [[5, 5], [6, 6]]);
    pad.undo();
    expect(pad.state.strokes).toEqual([pts([1, 1], [2, 2]), pts([3, 3], [4, 4])]);
    pad.undo();
    expect(pad.state.strokes).toEqual([pts([1, 1], [2, 2])]);
    expect(pad.state.hasSignature).toBe(true);
    pad.undo();
    expect(pad.state).toMatchObject({ strokes: [], hasSignature: false, canUndo: false });
    pad.undo(); // 더 되돌릴 것이 없어도 오류 없이 무시
    expect(pad.state.strokes).toEqual([]);
  });

  it('TC-SIGN-007 전체 지우기는 획을 0개로 하고 이어서 새로 그릴 수 있다', () => {
    const pad = drawn([[1, 1], [2, 2]], [[3, 3]]);
    pad.clear();
    expect(pad.state).toMatchObject({ strokes: [], hasSignature: false, canUndo: false });
    pad.addStroke(pts([7, 7], [8, 8]));
    expect(pad.state.strokes).toEqual([pts([7, 7], [8, 8])]);
    expect(pad.state.hasSignature).toBe(true);
  });

  it('그리는 중 되돌리기는 그 획을 끝내고 지운다', () => {
    const pad = drawn([[1, 1], [2, 2]]);
    pad.beginStroke({ x: 9, y: 9 });
    pad.undo();
    expect(pad.state.drawing).toBe(false);
    expect(pad.state.strokes).toEqual([pts([1, 1], [2, 2])]);
  });

  it('snapshot은 크기와 획의 복사본이며 이후 변경이 반영되지 않는다', () => {
    const pad = drawn([[1, 1], [2, 2]]);
    const snap = pad.snapshot();
    expect(snap).toEqual({ width: 1024, height: 512, strokes: [pts([1, 1], [2, 2])] });
    pad.clear();
    pad.addStroke(pts([5, 5]));
    expect(snap.strokes).toEqual([pts([1, 1], [2, 2])]);
  });

  it('변경될 때 구독자에게 알린다', () => {
    const pad = new SignaturePad(SIZE);
    let calls = 0;
    pad.subscribe(() => (calls += 1));
    pad.beginStroke({ x: 1, y: 1 });
    pad.extendStroke({ x: 2, y: 2 });
    pad.endStroke();
    expect(calls).toBeGreaterThanOrEqual(3);
    const before = calls;
    pad.endStroke(); // 변화 없음
    expect(calls).toBe(before);
  });
});
