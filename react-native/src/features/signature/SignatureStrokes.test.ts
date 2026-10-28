import { MAX_SIGNATURE_POINTS, SignatureStrokes } from './SignatureStrokes';
import { CANVAS } from './__testing__/draw';

const empty = () => SignatureStrokes.empty(CANVAS);

describe('SignatureStrokes', () => {
  it('TC-SIGN-001 획이 없으면 사인이 없다', () => {
    const s = empty();
    expect(s.hasSignature).toBe(false);
    expect(s.validStrokes).toEqual([]);
  });

  it('TC-SIGN-002 점 하나만 찍어도 하나의 획으로 인정한다', () => {
    const s = empty().beginStroke({ x: 10, y: 20 }).endStroke();
    expect(s.hasSignature).toBe(true);
    expect(s.validStrokes).toEqual([[{ x: 10, y: 20 }]]);
  });

  it('TC-SIGN-003 포인트가 없는 빈 획은 사인이 없는 것으로 취급한다', () => {
    // endStroke만 불러도, 시작하지 않은 appendPoint 이후 undo로 비워도 빈 획은 생기지 않는다.
    expect(empty().endStroke().hasSignature).toBe(false);
    expect(empty().beginStroke({ x: 1, y: 1 }).undo().endStroke().hasSignature).toBe(false);
  });

  it('TC-SIGN-004 포인트가 있는 획이면 사인이 있다, 여러 점을 이어 한 획이 된다', () => {
    const s = empty()
      .beginStroke({ x: 10, y: 10 })
      .appendPoint({ x: 20, y: 20 })
      .appendPoint({ x: 30, y: 25 })
      .endStroke();
    expect(s.hasSignature).toBe(true);
    expect(s.validStrokes).toHaveLength(1);
    expect(s.validStrokes[0]).toHaveLength(3);
  });

  it('TC-SIGN-005 캔버스 밖 좌표는 영역 안으로 보정한다', () => {
    const s = empty()
      .beginStroke({ x: -20, y: -5 })
      .appendPoint({ x: CANVAS.width + 50, y: CANVAS.height + 1 })
      .appendPoint({ x: CANVAS.width, y: 0 })
      .endStroke();
    expect(s.validStrokes[0]).toEqual([
      { x: 0, y: 0 },
      { x: CANVAS.width, y: CANVAS.height },
      { x: CANVAS.width, y: 0 },
    ]);
  });

  it('TC-SIGN-006 되돌리기는 마지막 획부터 하나씩 지우고 0개가 되면 사인이 없다', () => {
    let s = empty();
    for (const x of [10, 20, 30]) s = s.beginStroke({ x, y: 10 }).endStroke();
    expect(s.validStrokes).toHaveLength(3);
    s = s.undo();
    expect(s.validStrokes.map((stroke) => stroke[0].x)).toEqual([10, 20]);
    s = s.undo().undo();
    expect(s.validStrokes).toEqual([]);
    expect(s.hasSignature).toBe(false);
    expect(s.undo().validStrokes).toEqual([]); // 빈 상태에서 되돌려도 안전
  });

  it('TC-SIGN-007 전체 지우기 뒤 이어서 새로 그릴 수 있다', () => {
    const cleared = empty()
      .beginStroke({ x: 1, y: 1 })
      .endStroke()
      .beginStroke({ x: 2, y: 2 })
      .endStroke()
      .clear();
    expect(cleared.hasSignature).toBe(false);
    expect(cleared.beginStroke({ x: 5, y: 5 }).endStroke().hasSignature).toBe(true);
  });

  it('REQ-SIGN-002 불변이다: 변경은 새 인스턴스를 돌려주고 원본은 그대로다', () => {
    const base = empty().beginStroke({ x: 1, y: 1 }).endStroke();
    const next = base.beginStroke({ x: 2, y: 2 }).endStroke();
    expect(base.validStrokes).toHaveLength(1);
    expect(next.validStrokes).toHaveLength(2);
  });

  it('REQ-SIGN-002 그리는 중에 begin을 다시 부르면 이전 획을 끝내고 새 획을 시작한다', () => {
    const s = empty().beginStroke({ x: 1, y: 1 }).beginStroke({ x: 9, y: 9 }).endStroke();
    expect(s.validStrokes).toEqual([[{ x: 1, y: 1 }], [{ x: 9, y: 9 }]]);
  });
});

describe('SignatureStrokes: 입력 방어', () => {
  it('유한하지 않은 좌표(NaN, Infinity)는 버리고 획을 만들지 않는다', () => {
    let s = SignatureStrokes.empty(CANVAS).beginStroke({ x: NaN, y: 1 });
    expect(s.hasSignature).toBe(false);
    s = s
      .beginStroke({ x: 5, y: 5 })
      .appendPoint({ x: Infinity, y: 1 })
      .appendPoint({ x: 1, y: NaN });
    expect(s.validStrokes).toEqual([[{ x: 5, y: 5 }]]);
  });

  it('이웃한 점과의 거리가 최소 거리보다 작으면 샘플링에서 뺀다', () => {
    const s = SignatureStrokes.empty(CANVAS)
      .beginStroke({ x: 10, y: 10 })
      .appendPoint({ x: 10.3, y: 10.3 })
      .appendPoint({ x: 12, y: 10 })
      .endStroke();
    expect(s.validStrokes[0]).toEqual([
      { x: 10, y: 10 },
      { x: 12, y: 10 },
    ]);
  });

  it('총 점 수는 5000개까지만 받는다', () => {
    let s = SignatureStrokes.empty(CANVAS).beginStroke({ x: 0, y: 0 });
    for (let i = 1; i < 6000; i += 1)
      s = s.appendPoint({ x: (i % 300) + (i % 2), y: (i % 150) + 10 * (i % 2) });
    s = s.endStroke().beginStroke({ x: 1, y: 1 }).endStroke();
    expect(s.validStrokes.flat().length).toBe(MAX_SIGNATURE_POINTS);
  });
});
