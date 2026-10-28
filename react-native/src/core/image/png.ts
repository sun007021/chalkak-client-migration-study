import { deflate, inflate } from 'pako';

import { ImageDecodeError } from './ImageErrors';

type DeflateLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** PNG 청크 CRC(종류 + 데이터)에 쓰는 CRC-32. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * 8비트 RGBA(비인터레이스) 픽셀을 PNG로 인코딩한다. 행마다 필터 0을 쓰고 zlib(deflate)로 압축한다.
 * 압축하지 않으면 1024x512 RGBA가 2 MiB라 사인 업로드 한도(1 MiB)를 넘는다.
 */
export function encodePng(
  rgba: Uint8Array,
  width: number,
  height: number,
  /** zlib 압축 수준(0~9). 사인은 기본값, 업로드 중간 파일은 속도를 위해 1. */
  level: DeflateLevel = 6,
): Uint8Array {
  const stride = width * 4;
  if (rgba.length !== stride * height) throw new Error('픽셀 크기가 width*height*4와 다르다');
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header[8] = 8; // 비트 깊이
  header[9] = 6; // RGBA
  const parts = [
    Uint8Array.from(PNG_SIGNATURE),
    chunk('IHDR', header),
    chunk('IDAT', deflate(raw, { level })),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** 디코드한 8비트 RGBA 픽셀. */
export type RgbaPixels = { width: number; height: number; data: Uint8ClampedArray };

/** 색 유형별 한 픽셀의 채널 수. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * PNG(비인터레이스; 회색·RGB·팔레트·회색+알파·RGBA, 8비트 또는 16비트)를 8비트 RGBA로 푼다.
 * 16비트는 상위 바이트만 취한다(iOS 도구가 만든 확장 색 공간 PNG 대비). 그 밖의 형식·손상은 ImageDecodeError다.
 * 색 유형 6(RGBA 8비트)은 복사 없이 필터를 푼 버퍼를 그대로 돌려준다.
 */
export function decodePng(bytes: Uint8Array): RgbaPixels {
  if (bytes.length < 8 || PNG_SIGNATURE.some((value, i) => bytes[i] !== value)) {
    throw new ImageDecodeError('not a png');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = -1;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const parts: Uint8Array[] = [];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (data.length !== length) throw new ImageDecodeError('truncated png');
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      depth = data[8];
      colorType = data[9];
      const paletteOk = colorType !== 3 || depth === 8;
      if (
        (depth !== 8 && depth !== 16) ||
        !paletteOk ||
        !(colorType in CHANNELS) ||
        data[12] !== 0
      ) {
        throw new ImageDecodeError('unsupported png format');
      }
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') transparency = data;
    else if (type === 'IDAT') parts.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (width < 1 || height < 1 || parts.length === 0) throw new ImageDecodeError('empty png');

  const channels = CHANNELS[colorType];
  const sampleBytes = depth / 8;
  const pixelBytes = channels * sampleBytes;
  const stride = width * pixelBytes;
  let raw: Uint8Array;
  try {
    raw = inflate(concat(parts));
  } catch (error) {
    throw new ImageDecodeError(error instanceof Error ? error.message : 'bad png data');
  }
  if (raw.length < (stride + 1) * height) throw new ImageDecodeError('short png data');

  let rows = unfilter(raw, stride, height, pixelBytes);
  if (sampleBytes === 2) {
    // 샘플마다 상위 바이트(빅엔디언 앞 바이트)만 취한다.
    const narrow = new Uint8Array(width * channels * height);
    for (let i = 0; i < narrow.length; i += 1) narrow[i] = rows[i * 2];
    rows = narrow;
  }
  if (colorType === 6) {
    return {
      width,
      height,
      data: new Uint8ClampedArray(rows.buffer, rows.byteOffset, rows.length),
    };
  }
  const out = new Uint8ClampedArray(width * height * 4);
  const count = width * height;
  for (let p = 0; p < count; p += 1) {
    const s = p * channels;
    const d = p * 4;
    switch (colorType) {
      case 2:
        out[d] = rows[s];
        out[d + 1] = rows[s + 1];
        out[d + 2] = rows[s + 2];
        out[d + 3] = 255;
        break;
      case 0:
        out[d] = out[d + 1] = out[d + 2] = rows[s];
        out[d + 3] = 255;
        break;
      case 4:
        out[d] = out[d + 1] = out[d + 2] = rows[s];
        out[d + 3] = rows[s + 1];
        break;
      default: {
        const index = rows[s];
        if (!palette || index * 3 + 2 >= palette.length) throw new ImageDecodeError('bad palette');
        out[d] = palette[index * 3];
        out[d + 1] = palette[index * 3 + 1];
        out[d + 2] = palette[index * 3 + 2];
        out[d + 3] = transparency && index < transparency.length ? transparency[index] : 255;
      }
    }
  }
  return { width, height, data: out };
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** 행마다 앞의 필터 바이트(0 없음, 1 Sub, 2 Up, 3 Average, 4 Paeth)를 되돌린다. bpp는 한 픽셀의 바이트 수. */
function unfilter(raw: Uint8Array, stride: number, height: number, bpp: number): Uint8Array {
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    const prev = row - stride;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= bpp ? out[row + i - bpp] : 0;
      const up = y > 0 ? out[prev + i] : 0;
      const upLeft = y > 0 && i >= bpp ? out[prev + i - bpp] : 0;
      let predictor: number;
      switch (filter) {
        case 0:
          predictor = 0;
          break;
        case 1:
          predictor = left;
          break;
        case 2:
          predictor = up;
          break;
        case 3:
          predictor = (left + up) >> 1;
          break;
        case 4:
          predictor = paeth(left, up, upLeft);
          break;
        default:
          throw new ImageDecodeError('bad png filter');
      }
      out[row + i] = (raw[src + i] + predictor) & 0xff;
    }
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}
