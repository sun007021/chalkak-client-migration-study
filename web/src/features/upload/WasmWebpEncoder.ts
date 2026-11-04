import { throwIfAborted } from '../../core/abort';
import { createSurface, releaseSurface } from './canvasSurface';
import { WebpUnsupportedError, isDrawableImage } from './imagePorts';
import type { DecodedImage, WasmWebpEncoder } from './imagePorts';
import type { Size } from './imageSizing';
import { stripWebpMetadata, webpBlob } from './webpMetadata';

/**
 * canvas가 image/webp를 만들지 못하는 브라우저(예: 일부 Safari)용 WASM 인코더(@jsquash/webp, libwebp). 손실 정지 WebP만 만든다.
 * 인코더는 처음 쓸 때 동적 import로 받는다(canvas가 되는 브라우저는 내려받지 않는다). 모듈·WASM을 받거나 초기화하지 못하면 WebpUnsupportedError이고,
 * PNG/JPEG로 대신하지 않는다. 입력은 이미 목표 크기로 그린 픽셀이라 메타데이터가 없고, 결과에도 stripWebpMetadata를 한 번 더 적용한다.
 */
type Encode = (data: ImageData, options?: { quality?: number }) => Promise<ArrayBuffer>;

export class JsquashWebpEncoder implements WasmWebpEncoder {
  /** 초기화에 성공한 인코더만 기억한다(받기·초기화 실패는 일시적일 수 있어 다음 압축에서 다시 시도). */
  private ready: Promise<Encode> | null = null;

  available(): boolean {
    return typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
  }

  async compress(image: DecodedImage, size: Size, quality: number, signal: AbortSignal): Promise<Blob> {
    throwIfAborted(signal);
    if (!isDrawableImage(image)) throw new WebpUnsupportedError('image is not a browser image');
    const { drawable } = image;
    const pixels = readPixels(drawable, size);
    let encode: Encode;
    try {
      this.ready ??= load().catch((error: unknown) => {
        this.ready = null;
        throw error;
      });
      encode = await this.ready;
    } catch (error) {
      throw new WebpUnsupportedError(`wasm webp encoder could not be loaded: ${describe(error)}`);
    }
    throwIfAborted(signal);
    let buffer: ArrayBuffer;
    try {
      buffer = await encode(pixels, { quality });
    } catch (error) {
      throw new WebpUnsupportedError(`wasm webp encoding failed: ${describe(error)}`);
    }
    throwIfAborted(signal);
    const bytes = stripWebpMetadata(new Uint8Array(buffer));
    if (!bytes) throw new WebpUnsupportedError('wasm webp encoder returned a non-webp result');
    return webpBlob(bytes);
  }
}

async function load(): Promise<Encode> {
  const module = await import('@jsquash/webp/encode.js');
  await module.init();
  return module.default;
}

function readPixels(drawable: CanvasImageSource, size: Size): ImageData {
  const surface = createSurface(size.width, size.height);
  try {
    const context = surface.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!context) throw new WebpUnsupportedError('canvas is not available');
    context.imageSmoothingQuality = 'high';
    context.drawImage(drawable, 0, 0, size.width, size.height);
    return context.getImageData(0, 0, size.width, size.height);
  } finally {
    releaseSurface(surface);
  }
}

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));
