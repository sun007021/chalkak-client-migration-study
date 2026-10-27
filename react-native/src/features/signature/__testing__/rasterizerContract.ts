import { SIGNATURE_MAX_BYTES, SIGNATURE_PNG_SIZE } from '../../../shared/constants';
import type { SignatureRasterizer } from '../SignatureRasterizer';
import type { Point, Stroke } from '../Stroke';
import { decodePng, hasPngSignature } from './decodePng';

const { width: W, height: H, strokeWidth: STROKE } = SIGNATURE_PNG_SIZE;

const request = (strokes: readonly Stroke[]) => ({
  width: W,
  height: H,
  strokeWidth: STROKE,
  strokes,
});
const line = (x1: number, y1: number, x2: number, y2: number): Stroke => [
  { x: x1, y: y1 },
  { x: x2, y: y2 },
];

/**
 * 모든 SignatureRasterizer 구현이 지켜야 하는 PNG 계약(TC-SIGN-002/009/010/012/013/016).
 * 입력 획은 이미 PNG 좌표다. jest에서 돌릴 수 없는 구현(네이티브)은 같은 케이스를 기기 테스트로 옮긴다.
 */
export function describeRasterizerContract(name: string, create: () => SignatureRasterizer): void {
  describe(`${name} 래스터라이저 계약`, () => {
    it('TC-SIGN-013 PNG 시그니처(89 50 4E 47 0D 0A 1A 0A)로 시작하는 유효한 PNG이다', async () => {
      const bytes = await create().rasterize(request([line(100, 100, 900, 400)]));
      expect(hasPngSignature(bytes)).toBe(true);
      expect(() => decodePng(bytes)).not.toThrow();
    });

    it('TC-SIGN-009 출력 크기는 정확히 1024x512이다', async () => {
      const png = decodePng(await create().rasterize(request([line(100, 100, 900, 400)])));
      expect(png.width).toBe(1024);
      expect(png.height).toBe(512);
    });

    it('TC-SIGN-010 배경 픽셀은 alpha 0이고 획 픽셀은 RGB(255,255,255)에 alpha>0이다', async () => {
      const png = decodePng(await create().rasterize(request([line(100, 256, 900, 256)])));
      expect(png.pixel(0, 0).a).toBe(0);
      expect(png.pixel(W - 1, H - 1).a).toBe(0);
      expect(png.pixel(500, 256)).toEqual({ r: 255, g: 255, b: 255, a: 255 });
      let strokePixels = 0;
      for (let i = 0; i < png.rgba.length; i += 4) {
        if (png.rgba[i + 3] > 0) {
          strokePixels += 1;
          expect([png.rgba[i], png.rgba[i + 1], png.rgba[i + 2]]).toEqual([255, 255, 255]);
        }
      }
      expect(strokePixels).toBeGreaterThan(0);
    });

    it('TC-SIGN-012 획 두께는 14px이고 끝은 둥글다', async () => {
      const png = decodePng(await create().rasterize(request([line(100, 256, 900, 256)])));
      // x=500 열에서 불투명(alpha>=128) 픽셀 수 = 두께 14 (+-1 안티앨리어싱 허용)
      let thickness = 0;
      for (let y = 0; y < H; y += 1) if (png.pixel(500, y).a >= 128) thickness += 1;
      expect(thickness).toBeGreaterThanOrEqual(13);
      expect(thickness).toBeLessThanOrEqual(15);
      // 둥근 캡: 시작점 왼쪽 반지름(7px) 안쪽은 칠해지고 그 바깥은 비어 있다. 모서리(사각 캡이라면 칠해질 곳)는 비어 있다.
      expect(png.pixel(95, 256).a).toBeGreaterThanOrEqual(128);
      expect(png.pixel(90, 256).a).toBe(0);
      expect(png.pixel(95, 256 - 6).a).toBeLessThan(128); // 사각 캡이면 칠해지는 모서리
    });

    it('TC-SIGN-002 점 하나짜리 획은 지름 14px의 원으로 그려진다', async () => {
      const png = decodePng(await create().rasterize(request([[{ x: 512, y: 256 }]])));
      expect(png.pixel(512, 256).a).toBe(255);
      expect(png.pixel(512 + 6, 256).a).toBeGreaterThanOrEqual(128);
      expect(png.pixel(512, 256 - 6).a).toBeGreaterThanOrEqual(128);
      expect(png.pixel(512 + 10, 256).a).toBe(0);
      // 대각선 6,6 (거리 8.5 > 7)은 원 밖이다. 사각형이면 칠해진다.
      expect(png.pixel(512 + 6, 256 + 6).a).toBeLessThan(128);
    });

    it('TC-SIGN-012 곡선이 이어진다: 꺾인 세 점 사이에 빈틈이 없다', async () => {
      const stroke: Stroke = [
        { x: 100, y: 400 },
        { x: 500, y: 100 },
        { x: 900, y: 400 },
      ];
      const png = decodePng(await create().rasterize(request([stroke])));
      // 시작·끝점과 중간 근처에 칠해진 픽셀이 있다.
      expect(png.pixel(100, 400).a).toBeGreaterThan(0);
      expect(png.pixel(900, 400).a).toBeGreaterThan(0);
      let paintedColumns = 0;
      for (let x = 100; x <= 900; x += 1) {
        let hit = false;
        for (let y = 0; y < H && !hit; y += 1) hit = png.pixel(x, y).a > 0;
        if (hit) paintedColumns += 1;
      }
      expect(paintedColumns).toBe(801); // 모든 열에 획이 있다(끊김 없음)
    });

    it('TC-SIGN-016 수천 포인트의 긴 획도 1 MiB 이하이고 합리적 시간 안에 끝난다', async () => {
      const points: Point[] = Array.from({ length: 5000 }, (_, i) => ({
        x: 60 + (i % 900),
        y: 60 + Math.round(180 * (1 + Math.sin(i / 30))),
      }));
      const startedAt = process.hrtime.bigint();
      const bytes = await create().rasterize(request([points]));
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      expect(bytes.byteLength).toBeLessThanOrEqual(SIGNATURE_MAX_BYTES);
      expect(elapsedMs).toBeLessThan(3000);
    });
  });
}
