import { POST_IMAGE_CONTENT_TYPE } from '../../constants';

/**
 * canvas가 만든 WebP에서 메타데이터 청크(ICCP·EXIF·XMP)를 제거한다(REQ-UPL-033).
 * Chromium의 canvas 출력은 항상 sRGB ICC 프로필 청크(ICCP)를 넣는데, 업로드 사진은 메타데이터가 없어야 한다. canvas는 sRGB로 그리므로 프로필을 빼도 색이 달라지지 않는다.
 * VP8X의 메타데이터 플래그(ICC 0x20, EXIF 0x08, XMP 0x04)도 함께 내린다. 지울 것이 없으면 입력을 그대로 돌려주고, RIFF/WEBP 구조가 아니면 null이다.
 */
const STRIPPED = new Set(['ICCP', 'EXIF', 'XMP ']);
const VP8X_METADATA_FLAGS = 0x20 | 0x08 | 0x04;

export const ascii4 = (bytes: Uint8Array, offset: number): string => String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);

export interface WebpChunk {
  id: string;
  /** 청크 머리(id) 위치. */
  start: number;
  /** 내용 크기(패딩 제외). */
  size: number;
  /** 다음 청크 위치(홀수 크기의 패딩 포함, 마지막 청크의 패딩이 없으면 입력 끝). */
  end: number;
}

/**
 * RIFF/WEBP 헤더 12바이트 뒤의 청크를 엄격하게 순회한다. RIFF 선언 크기가 전체 길이 - 8이어야 하고(뒤에 붙은 바이트 거부),
 * 청크 크기가 남은 입력을 넘거나, 가운데 청크의 홀수 패딩이 없거나, 청크 머리보다 짧은 바이트가 남으면 null이다.
 * 마지막 청크의 홀수 패딩이 없는 것만 허용한다(일부 인코더 출력).
 */
export function readWebpChunks(bytes: Uint8Array): WebpChunk[] | null {
  if (bytes.length < 12 || ascii4(bytes, 0) !== 'RIFF' || ascii4(bytes, 8) !== 'WEBP') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) !== bytes.length - 8) return null;
  const chunks: WebpChunk[] = [];
  let offset = 12;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return null;
    const size = view.getUint32(offset + 4, true);
    const contentEnd = offset + 8 + size;
    if (contentEnd > bytes.length) return null;
    const padded = contentEnd + (size % 2);
    if (padded > bytes.length && contentEnd !== bytes.length) return null;
    const end = Math.min(padded, bytes.length);
    chunks.push({ id: ascii4(bytes, offset), start: offset, size, end });
    offset = end;
  }
  return chunks;
}

export function stripWebpMetadata(bytes: Uint8Array): Uint8Array | null {
  const chunks = readWebpChunks(bytes);
  if (!chunks) return null;
  const kept: Uint8Array[] = [];
  let removed = false;
  for (const { id, start, end } of chunks) {
    if (STRIPPED.has(id)) {
      removed = true;
      continue;
    }
    const chunk = bytes.slice(start, end);
    if (id === 'VP8X' && chunk.length > 8 && (chunk[8]! & VP8X_METADATA_FLAGS) !== 0) {
      chunk[8] = chunk[8]! & ~VP8X_METADATA_FLAGS;
      removed = true;
    }
    kept.push(chunk);
  }
  if (!removed) return bytes;
  const bodyLength = kept.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(12 + bodyLength);
  out.set(bytes.subarray(0, 12));
  new DataView(out.buffer).setUint32(4, 4 + bodyLength, true);
  let position = 12;
  for (const chunk of kept) {
    out.set(chunk, position);
    position += chunk.length;
  }
  return out;
}

const KNOWN_BYTES = new WeakMap<Blob, Uint8Array>();

/** 바이트로 만든 image/webp Blob. 만든 쪽이 바이트를 알고 있으므로 이후 검사에서 arrayBuffer()를 다시 읽지 않는다. */
export function webpBlob(bytes: Uint8Array): Blob {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: POST_IMAGE_CONTENT_TYPE });
  KNOWN_BYTES.set(blob, bytes);
  return blob;
}

/** Blob의 바이트. webpBlob으로 만든 것은 읽지 않고 돌려준다. */
export async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return KNOWN_BYTES.get(blob) ?? new Uint8Array(await blob.arrayBuffer());
}
