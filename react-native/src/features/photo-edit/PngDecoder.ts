import { inflate } from 'pako';

import { ImageDecodeError } from './ImageErrors';
import type { RgbaImage } from './ImageTypes';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** 색 유형별 한 픽셀의 채널 수(8비트만 지원한다). */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * 8비트 PNG(비인터레이스; 회색·RGB·팔레트·회색+알파·RGBA)를 RGBA로 푼다.
 * 네이티브 이미지 도구가 만든 무손실 중간 파일을 읽는 용도라 그 밖의 형식(16비트, 인터레이스)은 ImageDecodeError다.
 */
export function decodePng(bytes: Uint8Array): RgbaImage {
  if (bytes.length < 8 || SIGNATURE.some((value, i) => bytes[i] !== value)) {
    throw new ImageDecodeError('not a png');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
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
      const depth = data[8];
      colorType = data[9];
      if (depth !== 8 || !(colorType in CHANNELS) || data[12] !== 0) {
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
  const stride = width * channels;
  const raw = inflate(concat(parts));
  if (raw.length < (stride + 1) * height) throw new ImageDecodeError('short png data');

  const rows = unfilter(raw, width, height, channels);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const s = y * stride + x * channels;
      const d = (y * width + x) * 4;
      switch (colorType) {
        case 6:
          out.set(rows.subarray(s, s + 4), d);
          break;
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
          if (!palette || index * 3 + 2 >= palette.length)
            throw new ImageDecodeError('bad palette');
          out[d] = palette[index * 3];
          out[d + 1] = palette[index * 3 + 1];
          out[d + 2] = palette[index * 3 + 2];
          out[d + 3] = transparency && index < transparency.length ? transparency[index] : 255;
        }
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

/** 행마다 앞의 필터 바이트(0 없음, 1 Sub, 2 Up, 3 Average, 4 Paeth)를 되돌린다. */
function unfilter(raw: Uint8Array, width: number, height: number, channels: number): Uint8Array {
  const stride = width * channels;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    const prev = row - stride;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? out[row + i - channels] : 0;
      const up = y > 0 ? out[prev + i] : 0;
      const upLeft = y > 0 && i >= channels ? out[prev + i - channels] : 0;
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
