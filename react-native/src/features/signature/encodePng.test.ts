import { crc32, encodePng } from './encodePng';
import { decodePng } from './__testing__/decodePng';

describe('encodePng', () => {
  it('CRC-32 표준 벡터: "123456789" -> CBF43926, IEND 청크 -> AE426082', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082);
  });

  it('RGBA 픽셀을 그대로 되살릴 수 있는 PNG를 만든다', () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 9, 8, 7, 6]);
    const png = decodePng(encodePng(rgba, 2, 2));
    expect([png.width, png.height]).toEqual([2, 2]);
    expect(Array.from(png.rgba)).toEqual(Array.from(rgba));
  });

  it('픽셀 길이가 크기와 맞지 않으면 던진다', () => {
    expect(() => encodePng(new Uint8Array(3), 1, 1)).toThrow();
  });

  it('압축해서 빈 1024x512 이미지도 1 MiB보다 훨씬 작다', () => {
    expect(encodePng(new Uint8Array(1024 * 512 * 4), 1024, 512).byteLength).toBeLessThan(20_000);
  });
});
