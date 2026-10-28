import { inflateSync } from 'node:zlib';

export type DecodedPng = {
  width: number;
  height: number;
  /** RGBA 8비트, 행 우선. */
  rgba: Uint8Array;
  pixel: (x: number, y: number) => { r: number; g: number; b: number; a: number };
};

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export const hasPngSignature = (bytes: Uint8Array): boolean =>
  SIGNATURE.every((value, i) => bytes[i] === value);

/** 테스트 전용 최소 PNG 디코더: 8비트 RGBA(color type 6), 비인터레이스만 지원한다. 그 밖이면 던진다. */
export function decodePng(bytes: Uint8Array): DecodedPng {
  if (!hasPngSignature(bytes)) throw new Error('PNG 시그니처가 아니다');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      const bitDepth = data[8];
      const colorType = data[9];
      const interlace = data[12];
      if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
        throw new Error(`지원하지 않는 PNG 형식 depth=${bitDepth} color=${colorType}`);
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const rgba = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i += 1) {
      const left = i >= 4 ? rgba[y * stride + i - 4] : 0;
      const up = y > 0 ? rgba[(y - 1) * stride + i] : 0;
      const upLeft = y > 0 && i >= 4 ? rgba[(y - 1) * stride + i - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) predictor = paeth(left, up, upLeft);
      rgba[y * stride + i] = (line[i] + predictor) & 0xff;
    }
  }
  return {
    width,
    height,
    rgba,
    pixel: (x, y) => {
      const o = (y * width + x) * 4;
      return { r: rgba[o], g: rgba[o + 1], b: rgba[o + 2], a: rgba[o + 3] };
    },
  };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}
