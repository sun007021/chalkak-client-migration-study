/** 달력 이미지 테스트용 PNG: 시그니처 + IHDR(가로세로)만 맞춘 가짜 바이트. 실제 픽셀 데이터는 없다(실제 그리기는 Playwright). */
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const u32be = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

export function pngBytesOf(width: number, height: number): Uint8Array<ArrayBuffer> {
  return Uint8Array.from([...SIGNATURE, ...u32be(13), 0x49, 0x48, 0x44, 0x52, ...u32be(width), ...u32be(height), 8, 6, 0, 0, 0, 0, 0, 0, 0]);
}

export function pngOf(width = 1080, height = 1350, type = 'image/png'): Blob {
  return new Blob([pngBytesOf(width, height)], { type });
}
