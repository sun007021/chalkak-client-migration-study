/** 픽셀 버퍼(Uint8ClampedArray RGBA) 테스트 도구. */

export type Rgba = readonly [number, number, number, number];
export type Rgb = readonly [number, number, number];

/** 단색 w×h 버퍼. */
export function solid(width: number, height: number, color: Rgba): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < out.length; i += 4) out.set(color, i);
  return out;
}

/** 색 목록을 그대로 이어 붙인 버퍼. */
export function pixelsOf(colors: readonly Rgba[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(colors.length * 4);
  colors.forEach((c, i) => out.set(c, i * 4));
  return out;
}

/** i번째 픽셀. */
export function pixelAt(buffer: Uint8ClampedArray, index: number): Rgba {
  return [buffer[index * 4]!, buffer[index * 4 + 1]!, buffer[index * 4 + 2]!, buffer[index * 4 + 3]!];
}

/** 각 채널이 expected ± tolerance 안인가(알파는 정확히 같아야 한다). */
export function expectRgbNear(actual: Rgba, expected: Rgb, tolerance: number): void {
  for (let c = 0; c < 3; c += 1) {
    if (Math.abs(actual[c]! - expected[c]!) > tolerance) throw new Error(`채널 ${c}: ${actual[c]} (기대 ${expected[c]} ± ${tolerance}), 픽셀 [${actual.join(', ')}]`);
  }
}

/** 0~255 회색 256칸(0, 1, …, 255). */
export function grayRamp(): Uint8ClampedArray {
  return pixelsOf(Array.from({ length: 256 }, (_, v) => [v, v, v, 255] as const));
}

/** 밝기 히스토그램을 만든다: entries = [칸 번호, 개수]. */
export function histogramOf(entries: readonly (readonly [number, number])[]): Uint32Array {
  const h = new Uint32Array(256);
  for (const [bin, count] of entries) h[bin]! += count;
  return h;
}

/** 칸 from..to(포함)에 1개씩. */
export function flatHistogram(from: number, to: number): Uint32Array {
  return histogramOf(Array.from({ length: to - from + 1 }, (_, i) => [from + i, 1] as const));
}

/** 재현 가능한 의사 난수(0 이상 1 미만). */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
