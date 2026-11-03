import { POST_IMAGE_CONTENT_TYPE, POST_IMAGE_MAX_LONG_EDGE, WEBP_DOWNSCALE_MAX_ATTEMPTS, WEBP_QUALITY_LADDER } from '../../constants';
import { throwIfAborted } from '../../core/abort';
import { NotWebpError, SizeLimitExceededError } from './imagePorts';
import type { DecodedImage, WebpCompressor } from './imagePorts';
import { fitLongEdge, roundSizes } from './imageSizing';
import { ascii4, blobBytes, readWebpChunks } from './webpMetadata';

export interface EncodedPostImage {
  blob: Blob;
  /** 결과 이미지를 그린 크기. */
  width: number;
  height: number;
  /** 성공한 품질. */
  quality: number;
  /** compress를 부른 총 횟수. */
  attempts: number;
}

/**
 * 게시 사진 WebP 인코딩 사다리(REQ-UPL-030~032, 033).
 * 1) 시작 크기 = fitLongEdge(image 크기, POST_IMAGE_MAX_LONG_EDGE)  2) 라운드마다(roundSizes: 최대 3번 0.85배 축소, 총 4라운드) 품질을 WEBP_QUALITY_LADDER(90→80→60→40)
 * 순서로 compress를 한 번씩 부르고 첫 번째로 blob.size <= maxBytes인 결과를 쓴다(정확히 maxBytes는 허용, +1은 다음 단계).
 * 4라운드 16회가 모두 초과면 SizeLimitExceededError. 결과가 정지 WebP가 아니면(inspectWebp 실패 또는 blob.type이 image/webp가 아님) NotWebpError로 즉시 실패하며
 * 다른 형식·다음 품질로 넘어가지 않는다. signal이 abort되면 후속 compress를 부르지 않고 AbortError로 거절한다. image는 release하지 않는다.
 */
export async function encodePostImage(input: { image: DecodedImage; compressor: WebpCompressor; maxBytes: number; signal: AbortSignal }): Promise<EncodedPostImage> {
  const { image, compressor, maxBytes, signal } = input;
  const base = fitLongEdge({ width: image.width, height: image.height }, POST_IMAGE_MAX_LONG_EDGE);
  let attempts = 0;
  for (const size of roundSizes(base, WEBP_DOWNSCALE_MAX_ATTEMPTS)) {
    for (const quality of WEBP_QUALITY_LADDER) {
      throwIfAborted(signal);
      attempts += 1;
      const blob = await compressor.compress(image, size, quality, signal);
      throwIfAborted(signal);
      await assertStillWebp(blob);
      if (blob.size <= maxBytes) return { blob, width: size.width, height: size.height, quality, attempts };
    }
  }
  throw new SizeLimitExceededError(`still over ${maxBytes} bytes after ${attempts} attempts`);
}

async function assertStillWebp(blob: Blob): Promise<void> {
  if (blob.type !== POST_IMAGE_CONTENT_TYPE) throw new NotWebpError(`blob type ${blob.type || '(empty)'}`);
  const inspection = inspectWebp(await blobBytes(blob));
  if (!inspection.ok) throw new NotWebpError(inspection.reason);
}

export type WebpInspection =
  | { ok: true; chunks: string[] }
  | { ok: false; reason: 'too-short' | 'not-riff' | 'not-webp' | 'size-mismatch' | 'no-image-chunk' | 'animated' | 'metadata' };

/**
 * WebP 바이트 구조 검사(REQ-UPL-033, TC-UPL-032/033/043).
 * - 12바이트 미만 too-short, 0~3이 'RIFF'가 아니면 not-riff, 8~11이 'WEBP'가 아니면 not-webp,
 *   RIFF 크기 필드(4~7, little-endian) !== 전체 길이 - 8이면 size-mismatch.
 * - 12바이트부터 청크(4글자 id + u32 LE 크기 + 내용, 크기가 홀수면 1바이트 패딩; 마지막 청크의 패딩이 없어도 허용)를 순회한다.
 * - 첫 청크가 'VP8 ', 'VP8L', 'VP8X' 중 하나가 아니면 no-image-chunk.
 * - ANIM·ANMF 청크가 있거나 VP8X 플래그(첫 청크 내용 0번째 바이트)의 애니메이션 비트(0x02)가 켜져 있으면 animated.
 * - EXIF, 'XMP '(끝에 공백), ICCP 청크가 있으면 metadata. 검사 순서는 위 나열 순서.
 * 성공이면 청크 id 목록(순회 순서).
 */
export function inspectWebp(bytes: Uint8Array): WebpInspection {
  if (bytes.length < 12) return { ok: false, reason: 'too-short' };
  if (ascii4(bytes, 0) !== 'RIFF') return { ok: false, reason: 'not-riff' };
  if (ascii4(bytes, 8) !== 'WEBP') return { ok: false, reason: 'not-webp' };
  const found = readWebpChunks(bytes);
  if (!found) return { ok: false, reason: 'size-mismatch' };
  const chunks = found.map((chunk) => chunk.id);
  const first = found[0];
  if (!first || (first.id !== 'VP8 ' && first.id !== 'VP8L' && first.id !== 'VP8X')) return { ok: false, reason: 'no-image-chunk' };
  const animatedFlag = first.id === 'VP8X' && first.size > 0 && (bytes[first.start + 8]! & 0x02) !== 0;
  if (animatedFlag || chunks.some((id) => id === 'ANIM' || id === 'ANMF')) return { ok: false, reason: 'animated' };
  if (chunks.some((id) => id === 'EXIF' || id === 'XMP ' || id === 'ICCP')) return { ok: false, reason: 'metadata' };
  return { ok: true, chunks };
}

export type WebpBackend = 'canvas' | 'wasm';

/**
 * 웹 WebP 인코더 선택(upload-edit.md 플랫폼별 허용 차이): canvas가 image/webp 인코딩을 지원하면 'canvas', 아니면 WASM이 가능할 때 'wasm', 둘 다 안 되면 null(준비 실패).
 * PNG/JPEG 같은 다른 형식으로 폴백하는 선택지는 없다.
 */
export function selectWebpBackend(support: { canvasWebp: boolean; wasm: boolean }): WebpBackend | null {
  if (support.canvasWebp) return 'canvas';
  return support.wasm ? 'wasm' : null;
}
