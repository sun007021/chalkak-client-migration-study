/**
 * canvas가 만든 WebP에서 메타데이터 청크(ICCP·EXIF·XMP)를 제거한다(REQ-UPL-033).
 * Chromium의 canvas 출력은 항상 sRGB ICC 프로필 청크(ICCP)를 넣는데, 업로드 사진은 메타데이터가 없어야 한다. canvas는 sRGB로 그리므로 프로필을 빼도 색이 달라지지 않는다.
 * VP8X의 메타데이터 플래그(ICC 0x20, EXIF 0x08, XMP 0x04)도 함께 내린다. 지울 것이 없으면 입력을 그대로 돌려주고, RIFF/WEBP 구조가 아니면 null이다.
 */
const STRIPPED = new Set(['ICCP', 'EXIF', 'XMP ']);
const VP8X_METADATA_FLAGS = 0x20 | 0x08 | 0x04;

const ascii = (bytes: Uint8Array, offset: number): string => String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);

export function stripWebpMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 12 || ascii(bytes, 0) !== 'RIFF' || ascii(bytes, 8) !== 'WEBP') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [];
  let removed = false;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset);
    const size = view.getUint32(offset + 4, true);
    const end = Math.min(bytes.length, offset + 8 + size + (size % 2));
    if (STRIPPED.has(id)) {
      removed = true;
    } else {
      const chunk = bytes.slice(offset, end);
      if (id === 'VP8X' && chunk.length > 8 && (chunk[8]! & VP8X_METADATA_FLAGS) !== 0) {
        chunk[8] = chunk[8]! & ~VP8X_METADATA_FLAGS;
        removed = true;
      }
      kept.push(chunk);
    }
    offset = end;
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
