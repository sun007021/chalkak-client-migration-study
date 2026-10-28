import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AdjustValues, PhotoFilter } from '../PhotoEdit';
import type { Rgba } from '../PhotoColorTransform';

// 테스트 전용 독립 기준 구현: docs/spec/features/upload-edit.md 부록의 식을 그대로 옮겼다(구현 코드를 재사용하지 않는다).

const FILTERS_JSON = join(__dirname, '..', 'filters.json');

export type FiltersFile = {
  filters: { id: PhotoFilter; matrix: number[] | null }[];
  constants: Record<string, number>;
};

export function loadFiltersFile(): FiltersFile {
  return JSON.parse(readFileSync(FILTERS_JSON, 'utf8')) as FiltersFile;
}

export const srgbToLinear = (x: number): number =>
  x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
export const linearToSrgb = (x: number): number =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export function oracleToneTable(
  v: Pick<AdjustValues, 'blackPoint' | 'shadows' | 'highlights' | 'contrast'>,
) {
  const inputBlack = Math.max(v.blackPoint, 0) * 0.3;
  const outputBlack = Math.max(-v.blackPoint, 0) * 0.3;
  const table: number[] = [];
  let running = 0;
  for (let i = 0; i < 256; i += 1) {
    const x = i / 255;
    let t = clamp((x - inputBlack) / (1 - inputBlack), 0, 1);
    t += v.shadows * 0.25 * 4 * t * (1 - t) ** 2;
    t += v.highlights * 0.25 * 4 * t * t * (1 - t);
    t -= (v.contrast * 0.6 * Math.sin(2 * Math.PI * t)) / (2 * Math.PI);
    const y = outputBlack + (1 - outputBlack) * clamp(t, 0, 1);
    running = Math.max(running, y);
    table.push(running);
  }
  return table;
}

function readTable(table: number[], x: number): number {
  const position = clamp(x, 0, 1) * 255;
  const lo = Math.floor(position);
  const hi = Math.min(255, lo + 1);
  return table[lo] + (table[hi] - table[lo]) * (position - lo);
}

export function oracleMatrix(pixel: Rgba, matrix: readonly number[]): Rgba {
  const out = [0, 1, 2, 3].map((row) => {
    const m = matrix.slice(row * 5, row * 5 + 5);
    const value = pixel[0] * m[0] + pixel[1] * m[1] + pixel[2] * m[2] + pixel[3] * m[3] + m[4];
    return clamp(Math.round(value), 0, 255);
  });
  return [out[0], out[1], out[2], out[3]];
}

/** 선형(노출·따뜻함 -> 채도) -> 감마 -> 톤 곡선 -> 필터 행렬. */
export function oracleTransform(pixel: Rgba, v: AdjustValues, filter: PhotoFilter): Rgba {
  let [r, g, b] = [pixel[0], pixel[1], pixel[2]].map((c) => srgbToLinear(c / 255));
  const gain = 2 ** (1.5 * v.exposure);
  r *= gain * (1 + 0.25 * v.warmth);
  g *= gain;
  b *= gain * (1 - 0.25 * v.warmth);
  const luma = 0.2125 * r + 0.7154 * g + 0.0721 * b;
  [r, g, b] = [r, g, b].map((c) => luma + (1 + v.saturation) * (c - luma));
  const table = oracleToneTable(v);
  const stored = [r, g, b].map((c) => {
    const y = readTable(table, linearToSrgb(clamp(c, 0, 1)));
    return clamp(Math.round(y * 255), 0, 255);
  });
  const adjusted: Rgba = [stored[0], stored[1], stored[2], pixel[3]];
  const matrix = loadFiltersFile().filters.find((f) => f.id === filter)?.matrix;
  return matrix ? oracleMatrix(adjusted, matrix) : adjusted;
}

export const zeroValues = (): AdjustValues => ({
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  blackPoint: 0,
  saturation: 0,
  warmth: 0,
});

export const withValues = (patch: Partial<AdjustValues>): AdjustValues => ({
  ...zeroValues(),
  ...patch,
});

/** 두 픽셀이 채널마다 tolerance 이내인지. */
export function maxChannelDiff(a: Rgba, b: Rgba): number {
  return Math.max(...[0, 1, 2, 3].map((i) => Math.abs(a[i] - b[i])));
}
