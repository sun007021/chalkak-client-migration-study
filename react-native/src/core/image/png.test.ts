import { deflate } from 'pako';

import { crc32, decodePng as decodeRgba, encodePng } from './png';
import { ImageDecodeError } from './ImageErrors';
import { decodePng } from '../../features/signature/__testing__/decodePng';

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

function crc(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
  return out;
}

/** 필터를 직접 고른 PNG. rows는 필터 바이트를 포함한 원시 행. */
function pngOf(
  width: number,
  height: number,
  colorType: number,
  raw: number[],
  extra: Uint8Array[] = [],
  depth = 8,
): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = depth;
  header[9] = colorType;
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    ...extra,
    chunk('IDAT', deflate(Uint8Array.from(raw))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe('decodePng(RGBA 해석)', () => {
  it('encodePng로 만든 RGBA를 그대로 되돌린다', () => {
    const rgba = new Uint8Array(3 * 2 * 4).map((_, i) => (i * 37) % 256);
    const image = decodeRgba(encodePng(rgba, 3, 2));
    expect(image.width).toBe(3);
    expect(image.height).toBe(2);
    expect(Array.from(image.data)).toEqual(Array.from(rgba));
  });

  it('필터 Sub·Up·Average·Paeth를 되돌린다(회색 3x5)', () => {
    // 원본 행(회색): 10 20 30 / 15 25 35 / 12 22 32 / 40 50 60 / 41 52 63
    const raw = [
      1,
      10,
      10,
      10, // Sub: 10, 20, 30
      2,
      5,
      5,
      5, // Up: 15, 25, 35
      3,
      5,
      2,
      1, // Average
      4,
      28,
      28,
      28, // Paeth
      0,
      41,
      52,
      63,
    ];
    const image = decodeRgba(pngOf(3, 5, 0, raw));
    const gray = Array.from({ length: 15 }, (_, i) => image.data[i * 4]);
    // 첫 두 행은 계산한 그대로
    expect(gray.slice(0, 6)).toEqual([10, 20, 30, 15, 25, 35]);
    // 평균: [5+floor((0+15)/2)=12, 2+floor((12+25)/2)=20, 1+floor((20+35)/2)=28]
    expect(gray.slice(6, 9)).toEqual([12, 20, 28]);
    // Paeth: [28+12=40, 28+40=68, 28+68=96]
    expect(gray.slice(9, 12)).toEqual([40, 68, 96]);
    expect(image.data[3]).toBe(255);
  });

  it('RGB는 알파 255로, 회색+알파·팔레트(tRNS)도 RGBA로 푼다', () => {
    const rgb = decodeRgba(pngOf(1, 1, 2, [0, 1, 2, 3]));
    expect(Array.from(rgb.data)).toEqual([1, 2, 3, 255]);
    const ga = decodeRgba(pngOf(1, 1, 4, [0, 9, 128]));
    expect(Array.from(ga.data)).toEqual([9, 9, 9, 128]);
    const palette = decodeRgba(
      pngOf(
        2,
        1,
        3,
        [0, 0, 1],
        [
          chunk('PLTE', Uint8Array.from([255, 0, 0, 0, 255, 0])),
          chunk('tRNS', Uint8Array.from([200])),
        ],
      ),
    );
    expect(Array.from(palette.data)).toEqual([255, 0, 0, 200, 0, 255, 0, 255]);
  });

  it('PNG가 아니거나 지원하지 않는 형식이면 ImageDecodeError다', () => {
    expect(() => decodeRgba(Uint8Array.from([1, 2, 3]))).toThrow(ImageDecodeError);
    expect(() => decodeRgba(pngOf(1, 1, 3, [0, 0, 0, 0], [], 16))).toThrow(ImageDecodeError);
    expect(() => decodeRgba(pngOf(2, 2, 6, [0, 1, 2, 3, 4]))).toThrow(ImageDecodeError);
  });

  it('16비트 PNG는 상위 바이트만 취해 8비트로 푼다(RGB, RGBA)', () => {
    const rgb = decodeRgba(pngOf(1, 1, 2, [0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc], [], 16));
    expect(Array.from(rgb.data)).toEqual([0x12, 0x56, 0x9a, 255]);
    const rgba = decodeRgba(
      pngOf(1, 1, 6, [0, 0x01, 0xff, 0x02, 0xff, 0x03, 0xff, 0x80, 0x00], [], 16),
    );
    expect(Array.from(rgba.data)).toEqual([1, 2, 3, 0x80]);
  });

  it('압축 데이터가 깨졌으면 pako 오류가 아니라 ImageDecodeError다', () => {
    const good = pngOf(2, 2, 6, new Array(2 * (1 + 8)).fill(0));
    // IDAT 데이터 한가운데를 망가뜨린다(CRC는 읽지 않는다).
    const broken = Uint8Array.from(good);
    const at = broken.findIndex(
      (_, i) => String.fromCharCode(...broken.subarray(i, i + 4)) === 'IDAT',
    );
    broken[at + 5] = 0xff;
    broken[at + 6] = 0xff;
    expect(() => decodeRgba(broken)).toThrow(ImageDecodeError);
  });

  it('RGBA 8비트는 필터를 푼 버퍼를 복사 없이 그대로 쓴다', () => {
    const image = decodeRgba(pngOf(1, 1, 6, [0, 9, 8, 7, 6]));
    expect(Array.from(image.data)).toEqual([9, 8, 7, 6]);
  });
});
