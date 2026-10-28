/** 업로드 테스트용 가짜 이미지 바이트. 실제 인코더 없이 RIFF/WEBP 구조만 맞춘다. */

const ascii = (text: string): number[] => Array.from(text, (ch) => ch.charCodeAt(0));
const u32le = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

export interface ChunkSpec {
  /** 4글자 청크 id. 'VP8 ', 'VP8L', 'VP8X', 'ANIM', 'EXIF', 'XMP ', 'ICCP' 등. */
  id: string;
  /** 내용 바이트(숫자 배열) 또는 길이(0으로 채움). */
  payload: number[] | number;
}

/** 청크 목록으로 WebP를 만든다. 청크 크기가 홀수면 패딩 1바이트를 붙이고 RIFF 크기는 전체 길이 - 8이다. */
export function webpFromChunks(chunks: readonly ChunkSpec[]): Uint8Array<ArrayBuffer> {
  const body: number[] = [];
  for (const chunk of chunks) {
    const payload = typeof chunk.payload === 'number' ? new Array<number>(chunk.payload).fill(0) : chunk.payload;
    body.push(...ascii(chunk.id), ...u32le(payload.length), ...payload);
    if (payload.length % 2 === 1) body.push(0);
  }
  return Uint8Array.from([...ascii('RIFF'), ...u32le(4 + body.length), ...ascii('WEBP'), ...body]);
}

/** 정확히 totalBytes 바이트(>= 24)인 정지 WebP: 'VP8 ' 청크 하나로 채운다. 홀수 길이면 마지막 청크의 패딩은 없다(RIFF 크기 = totalBytes - 8). */
export function webpBytes(totalBytes: number): Uint8Array<ArrayBuffer> {
  if (totalBytes < 24) throw new Error('webpBytes: too short');
  const out = new Uint8Array(totalBytes);
  out.set([...ascii('RIFF'), ...u32le(totalBytes - 8), ...ascii('WEBP'), ...ascii('VP8 '), ...u32le(totalBytes - 20)]);
  return out;
}

export function webpBlob(totalBytes: number): Blob {
  return new Blob([webpBytes(totalBytes)], { type: 'image/webp' });
}

/** PNG 시그니처로 시작하는 byteLength 바이트. */
export function pngBytes(byteLength = 64): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(Math.max(byteLength, 8));
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return out;
}

export async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}
