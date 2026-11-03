import { POST_IMAGE_CONTENT_TYPE } from '../../constants';
import { WebpUnsupportedError } from './imagePorts';
import type { DecodedImage, WebpCompressor } from './imagePorts';
import type { Size } from './imageSizing';
import { stripWebpMetadata } from './webpMetadata';

type Surface = OffscreenCanvas | HTMLCanvasElement;

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function createSurface(width: number, height: number): Surface {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function release(surface: Surface): void {
  // 큰 canvas 메모리를 바로 돌려준다.
  surface.width = 0;
  surface.height = 0;
}

/** surface를 image/webp로 인코딩한다. 브라우저가 WebP를 만들지 못해 다른 형식을 돌려주면(type이 image/webp가 아님) 결과를 쓰지 않고 null이다. */
async function encodeWebp(surface: Surface, quality: number): Promise<Blob | null> {
  const ratio = Math.min(1, Math.max(0, quality / 100));
  const blob =
    'convertToBlob' in surface
      ? await surface.convertToBlob({ type: POST_IMAGE_CONTENT_TYPE, quality: ratio })
      : await new Promise<Blob | null>((resolve) => surface.toBlob(resolve, POST_IMAGE_CONTENT_TYPE, ratio));
  if (!blob || blob.type !== POST_IMAGE_CONTENT_TYPE) return null;
  // Chromium은 canvas WebP에 sRGB ICC 프로필(ICCP)을 넣는다. 업로드 사진에는 메타데이터가 없어야 하므로 뺀다.
  const stripped = stripWebpMetadata(new Uint8Array(await blob.arrayBuffer()));
  return stripped ? new Blob([stripped as Uint8Array<ArrayBuffer>], { type: POST_IMAGE_CONTENT_TYPE }) : null;
}

/** 이 브라우저의 canvas가 image/webp로 인코딩하는지 1×1 canvas로 확인한다(Safari 등은 조용히 다른 형식을 돌려준다). */
export async function probeCanvasWebp(): Promise<boolean> {
  try {
    const surface = createSurface(1, 1);
    // 렌더링 컨텍스트가 있어야 OffscreenCanvas가 인코딩한다.
    surface.getContext('2d');
    const blob = await encodeWebp(surface, 80);
    release(surface);
    return blob !== null;
  } catch {
    return false;
  }
}

/**
 * canvas로 손실 WebP 한 번 압축(OffscreenCanvas.convertToBlob 우선, 없으면 canvas.toBlob). size 크기로 그리고 quality(0~100)로 인코딩한다.
 * canvas 출력에는 EXIF·XMP·ICC가 들어가지 않는다. 결과 type이 image/webp가 아니면 WebpUnsupportedError이고 다른 형식으로 대신하지 않는다.
 */
export class CanvasWebpCompressor implements WebpCompressor {
  async compress(image: DecodedImage, size: Size, quality: number, signal: AbortSignal): Promise<Blob> {
    if (signal.aborted) throw abortError();
    const drawable = (image as { drawable?: CanvasImageSource }).drawable;
    if (!drawable) throw new WebpUnsupportedError('image is not a browser image');
    const surface = createSurface(size.width, size.height);
    try {
      const context = surface.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
      if (!context) throw new WebpUnsupportedError('canvas is not available');
      context.imageSmoothingQuality = 'high';
      context.drawImage(drawable, 0, 0, size.width, size.height);
      const blob = await encodeWebp(surface, quality);
      if (signal.aborted) throw abortError();
      if (!blob) throw new WebpUnsupportedError('canvas did not produce image/webp');
      return blob;
    } finally {
      release(surface);
    }
  }
}
