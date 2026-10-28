import type { DecodedImage, WebpCompressor } from './imagePorts';

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
export function encodePostImage(_input: { image: DecodedImage; compressor: WebpCompressor; maxBytes: number; signal: AbortSignal }): Promise<EncodedPostImage> {
  throw new Error('not implemented');
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
export function inspectWebp(_bytes: Uint8Array): WebpInspection {
  throw new Error('not implemented');
}

export type WebpBackend = 'canvas' | 'wasm';

/**
 * 웹 WebP 인코더 선택(upload-edit.md 플랫폼별 허용 차이): canvas가 image/webp 인코딩을 지원하면 'canvas', 아니면 WASM이 가능할 때 'wasm', 둘 다 안 되면 null(준비 실패).
 * PNG/JPEG 같은 다른 형식으로 폴백하는 선택지는 없다.
 */
export function selectWebpBackend(_support: { canvasWebp: boolean; wasm: boolean }): WebpBackend | null {
  throw new Error('not implemented');
}
