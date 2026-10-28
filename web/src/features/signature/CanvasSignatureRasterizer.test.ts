import { SIGNATURE_CONTENT_TYPE, SIGNATURE_PNG_SIZE } from '../../constants';
import { RecordingSurface } from '../../test/RecordingSurface';
import { fakePng } from '../../test/FakeSignatureRasterizer';
import { buildSignatureCommands } from './signatureGeometry';
import type { PadPoint, SignatureDrawing } from './SignaturePad';
import { CanvasSignatureRasterizer } from './SignatureRasterizer';

const pts = (...xy: [number, number][]): PadPoint[] => xy.map(([x, y]) => ({ x, y }));
const drawing = (...strokes: [number, number][][]): SignatureDrawing => ({ width: 1024, height: 512, strokes: strokes.map((s) => pts(...s)) });

function setup(png?: Blob) {
  const surfaces: RecordingSurface[] = [];
  const rasterizer = new CanvasSignatureRasterizer({
    createSurface: (w, h) => {
      const s = new RecordingSurface(w, h);
      if (png) s.pngBlob = png;
      surfaces.push(s);
      return s;
    },
  });
  return { rasterizer, surfaces };
}

describe('CanvasSignatureRasterizer', () => {
  it('TC-SIGN-009 표면을 정확히 1024×512로 만들고 호출마다 새 표면을 쓴다', async () => {
    const { rasterizer, surfaces } = setup();
    await rasterizer.rasterize(drawing([[10, 10], [200, 100]]));
    await rasterizer.rasterize(drawing([[50, 50]]));
    expect(surfaces).toHaveLength(2);
    for (const s of surfaces) {
      expect([s.width, s.height]).toEqual([SIGNATURE_PNG_SIZE.width, SIGNATURE_PNG_SIZE.height]);
    }
    expect([SIGNATURE_PNG_SIZE.width, SIGNATURE_PNG_SIZE.height]).toEqual([1024, 512]);
  });

  it('TC-SIGN-010 배경을 칠하지 않고(투명) 획과 점은 흰색 #ffffff로 그린다', async () => {
    const { rasterizer, surfaces } = setup();
    await rasterizer.rasterize(drawing([[10, 10], [200, 100], [300, 50]], [[400, 400]]));
    const s = surfaces[0]!;
    expect(s.strokeStyle).toBe('#ffffff');
    expect(s.fillStyle).toBe('#ffffff');
    // 칠하기(stroke/fill) 전에 해당 스타일이 정해져 있다.
    const firstStroke = s.calls.findIndex((c) => c.name === 'stroke');
    const firstFill = s.calls.findIndex((c) => c.name === 'fill');
    for (const prop of ['strokeStyle', 'lineWidth', 'lineCap', 'lineJoin']) {
      const entry = s.styleLog.find((e) => e.prop === prop);
      expect(entry, prop).toBeDefined();
      expect(entry!.callIndex, prop).toBeLessThanOrEqual(firstStroke);
    }
    const fillEntry = s.styleLog.find((e) => e.prop === 'fillStyle');
    expect(fillEntry).toBeDefined();
    expect(fillEntry!.callIndex).toBeLessThanOrEqual(firstFill);
    // 흰색 이외의 색을 설정하지 않는다.
    for (const e of s.styleLog.filter((x) => x.prop === 'strokeStyle' || x.prop === 'fillStyle')) expect(e.value).toBe('#ffffff');
  });

  it('TC-SIGN-012 획 두께 14, 둥근 끝(cap)과 둥근 이음(join)이다', async () => {
    const { rasterizer, surfaces } = setup();
    await rasterizer.rasterize(drawing([[10, 10], [200, 100]]));
    const s = surfaces[0]!;
    expect(s.lineWidth).toBe(SIGNATURE_PNG_SIZE.strokeWidth);
    expect(s.lineWidth).toBe(14);
    expect(s.lineCap).toBe('round');
    expect(s.lineJoin).toBe('round');
  });

  it('TC-SIGN-002 점 하나는 반지름 7의 원을 arc + fill로 그린다(stroke가 아니다)', async () => {
    const { rasterizer, surfaces } = setup();
    await rasterizer.rasterize(drawing([[100, 100]]));
    const s = surfaces[0]!;
    const arc = s.calls.find((c) => c.name === 'arc')!;
    expect(arc.args[2]).toBe(7);
    expect(arc.args[3]).toBe(0);
    expect(arc.args[4]).toBeCloseTo(Math.PI * 2, 10);
    expect(s.names()).toContain('fill');
    expect(s.names()).not.toContain('stroke');
    expect(arc.args[0]).toBeCloseTo(512, 0);
    expect(arc.args[1]).toBeCloseTo(256, 0);
  });

  it('TC-SIGN-012 점이 둘 이상인 획은 beginPath → moveTo → quadraticCurveTo/lineTo → stroke 순서로 buildSignatureCommands 결과를 그대로 그린다', async () => {
    const { rasterizer, surfaces } = setup();
    const d = drawing([[10, 10], [100, 80], [200, 30], [300, 90]], [[400, 300], [450, 320]]);
    await rasterizer.rasterize(d);
    const s = surfaces[0]!;
    const expected: string[] = [];
    for (const cmd of buildSignatureCommands(d, { width: 1024, height: 512, padding: 48, strokeWidth: 14 })) {
      if (cmd.kind !== 'stroke') continue;
      expected.push('beginPath');
      for (const op of cmd.ops) expected.push(op.op === 'move' ? 'moveTo' : op.op === 'line' ? 'lineTo' : 'quadraticCurveTo');
      expected.push('stroke');
    }
    expect(s.names().filter((n) => n !== 'toPng')).toEqual(expected);
  });

  it('획 순서대로 그리고(점·선 섞임 포함) 마지막에 toPng를 한 번 부른다', async () => {
    const { rasterizer, surfaces } = setup();
    await rasterizer.rasterize(drawing([[10, 10], [100, 100]], [[300, 300]], [[400, 100], [420, 140]]));
    const names = surfaces[0]!.names();
    expect(names.filter((n) => n === 'toPng')).toHaveLength(1);
    expect(names[names.length - 1]).toBe('toPng');
    expect(names.indexOf('arc')).toBeGreaterThan(names.indexOf('stroke'));
    expect(names.lastIndexOf('stroke')).toBeGreaterThan(names.indexOf('arc'));
  });

  it('TC-SIGN-013 표면의 PNG Blob을 그대로 돌려준다(image/png)', async () => {
    const expected = fakePng(256);
    const { rasterizer } = setup(expected);
    const png = await rasterizer.rasterize(drawing([[10, 10], [100, 100]]));
    expect(png).toBe(expected);
    expect(png.type).toBe(SIGNATURE_CONTENT_TYPE);
  });

  it('TC-SIGN-016 수천 포인트의 긴 획도 한 획으로 끝나고 호출 수가 점 수에 비례한다', async () => {
    const { rasterizer, surfaces } = setup();
    const many: [number, number][] = Array.from({ length: 5000 }, (_, i) => [(i * 7) % 1024, (i * 13) % 512]);
    await rasterizer.rasterize(drawing(many));
    const s = surfaces[0]!;
    expect(s.names().filter((n) => n === 'beginPath')).toHaveLength(1);
    expect(s.names().filter((n) => n === 'stroke')).toHaveLength(1);
    expect(s.calls.length).toBeLessThan(5100);
  });

  it('사인이 없으면 아무것도 그리지 않는다', async () => {
    const { rasterizer, surfaces } = setup();
    await rasterizer.rasterize(drawing());
    expect(surfaces[0]!.names().filter((n) => n !== 'toPng')).toEqual([]);
  });
});
