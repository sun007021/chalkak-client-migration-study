import { POST_IMAGE_CONTENT_TYPE, POST_IMAGE_MAX_LONG_EDGE } from '../../constants';
import { abortError, throwIfAborted } from '../../core/abort';
import { CanvasWebpCompressor, probeCanvasWebp } from './CanvasWebpCompressor';
import { ImageDecodeError, WebpUnsupportedError } from './imagePorts';
import type { DecodedImage, DecodeOptions, ImageDecoder, WasmWebpEncoder, WebpCompressor } from './imagePorts';
import { fitLongEdge } from './imageSizing';
import type { Size } from './imageSizing';
import { selectWebpBackend } from './postImageEncoder';
import { JsquashWebpEncoder } from './WasmWebpEncoder';

/**
 * createImageBitmap을 쓰지 못하는 브라우저의 대체 경로(<img> 전체를 메모리에 디코드해 canvas에 그린다)에서 받아 줄 최대 화소 수.
 * 1억 화소(예: 12000×8333)는 RGBA로 약 400MB라 모바일 탭이 죽는 경계라서 넘으면 디코드 실패로 처리한다. createImageBitmap 경로는 디코드 단계에서 줄여 읽으므로 제한하지 않는다.
 */
export const MAX_FALLBACK_PIXELS = 100_000_000;

/** 브라우저 디코더가 돌려주는 핸들. 압축기가 그릴 수 있는 원본(ImageBitmap 또는 이미 목표 크기로 그린 canvas)을 들고 있다. */
export class BrowserDecodedImage implements DecodedImage {
  constructor(
    readonly drawable: ImageBitmap | HTMLCanvasElement,
    readonly width: number,
    readonly height: number,
  ) {}

  release(): void {
    if ('close' in this.drawable) this.drawable.close();
    else {
      // canvas 메모리를 바로 돌려준다.
      this.drawable.width = 0;
      this.drawable.height = 0;
    }
  }
}

/** <img>로 보이는 방향의 크기를 읽는다. 브라우저는 EXIF 방향을 반영한 naturalWidth/Height를 주고, 화면에 그리기 전에는 디코드하지 않는다. */
function loadElement(source: Blob, signal: AbortSignal): Promise<{ element: HTMLImageElement; revoke: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const element = new Image();
    const revoke = () => URL.revokeObjectURL(url);
    const onAbort = () => {
      element.src = '';
      revoke();
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    element.onload = () => {
      signal.removeEventListener('abort', onAbort);
      resolve({ element, revoke });
    };
    element.onerror = () => {
      signal.removeEventListener('abort', onAbort);
      revoke();
      reject(new ImageDecodeError('cannot load image'));
    };
    element.src = url;
  });
}

/** createImageBitmap이 resize 옵션을 받지 못하는 경우(옵션 미지원). 이때만 <img> 대체 경로로 간다. 디코드 실패(InvalidStateError 등)는 대체하지 않고 실패시킨다. */
function isResizeUnsupported(error: unknown): boolean {
  if (error instanceof TypeError || error instanceof RangeError) return true;
  return error instanceof DOMException && (error.name === 'NotSupportedError' || error.name === 'IndexSizeError');
}

/**
 * createImageBitmap(imageOrientation: 'from-image', resizeWidth/Height)로 디코드 단계에서 목표 크기만 만든다(전체 해상도 비트맵을 만들지 않는다, REQ-UPL-027).
 * createImageBitmap이 없거나 옵션을 받지 못하면 <img>를 목표 크기 canvas에 그려 대신한다. 움직이는 이미지는 첫 프레임만 쓴다.
 */
export class BrowserImageDecoder implements ImageDecoder {
  /** <img>의 naturalWidth/Height(EXIF 방향 반영)와 decode() 성공으로 읽을 수 있는 이미지인지 확인한다. 전체 해상도 비트맵을 만들지 않는다. */
  async probe(source: Blob, signal: AbortSignal): Promise<Size> {
    throwIfAborted(signal);
    if (source.size === 0) throw new ImageDecodeError('empty file');
    const { element, revoke } = await loadElement(source, signal);
    try {
      try {
        await element.decode();
      } catch {
        throw new ImageDecodeError('image cannot be decoded');
      }
      throwIfAborted(signal);
      const size: Size = { width: element.naturalWidth, height: element.naturalHeight };
      if (size.width < 1 || size.height < 1) throw new ImageDecodeError('image has no size');
      return size;
    } finally {
      revoke();
    }
  }

  async decode(source: Blob, options: DecodeOptions, signal: AbortSignal): Promise<DecodedImage> {
    throwIfAborted(signal);
    if (source.size === 0) throw new ImageDecodeError('empty file');
    const { element, revoke } = await loadElement(source, signal);
    try {
      const natural: Size = { width: element.naturalWidth, height: element.naturalHeight };
      if (natural.width < 1 || natural.height < 1) throw new ImageDecodeError('image has no size');
      const target = fitLongEdge(natural, options.maxLongEdge);
      const bitmap = await this.decodeBitmap(source, natural, target);
      if (signal.aborted) {
        bitmap?.close();
        throw abortError();
      }
      if (bitmap) return new BrowserDecodedImage(bitmap, bitmap.width, bitmap.height);
      if (natural.width * natural.height > MAX_FALLBACK_PIXELS) throw new ImageDecodeError('image is too large for the fallback decoder');
      return new BrowserDecodedImage(this.drawToCanvas(element, target), target.width, target.height);
    } finally {
      revoke();
    }
  }

  /** createImageBitmap이 없거나 resize 옵션을 받지 못하면 null(호출한 쪽이 <img> + canvas로 대신한다). 디코드 자체가 실패하면 ImageDecodeError. */
  private async decodeBitmap(source: Blob, natural: Size, target: Size): Promise<ImageBitmap | null> {
    if (typeof createImageBitmap !== 'function') return null;
    const shrink = target.width !== natural.width || target.height !== natural.height;
    try {
      const bitmap = await createImageBitmap(source, shrink ? { imageOrientation: 'from-image', resizeWidth: target.width, resizeHeight: target.height, resizeQuality: 'high' } : { imageOrientation: 'from-image' });
      // 브라우저가 resize를 무시했다면(크기가 목표와 다르면) 이 경로를 쓰지 않는다.
      if (bitmap.width !== target.width || bitmap.height !== target.height) {
        bitmap.close();
        return null;
      }
      return bitmap;
    } catch (error) {
      if (isResizeUnsupported(error)) return null;
      throw new ImageDecodeError(error instanceof Error ? error.message : 'createImageBitmap failed');
    }
  }

  private drawToCanvas(element: HTMLImageElement, target: Size): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext('2d');
    if (!context) throw new ImageDecodeError('canvas is not available');
    context.imageSmoothingQuality = 'high';
    context.drawImage(element, 0, 0, target.width, target.height);
    return canvas;
  }
}

/** 기본 WebP 압축기: canvas가 image/webp를 만들면 canvas, 아니면 WASM, 둘 다 안 되면 WebpUnsupportedError. canvas 지원은 확인에 성공한 뒤로는 다시 확인하지 않는다. */
export class BrowserWebpCompressor implements WebpCompressor {
  /** canvas가 WebP를 만든다고 확인된 뒤에만 기억한다(실패는 일시적일 수 있어 다음에 다시 확인). */
  private canvasWebp = false;

  constructor(
    private readonly canvas: WebpCompressor = new CanvasWebpCompressor(),
    private readonly wasm: WasmWebpEncoder = new JsquashWebpEncoder(),
    private readonly probe: () => Promise<boolean> = probeCanvasWebp,
  ) {}

  async compress(image: DecodedImage, size: Size, quality: number, signal: AbortSignal): Promise<Blob> {
    if (!this.canvasWebp) this.canvasWebp = await this.probe();
    const backend = selectWebpBackend({ canvasWebp: this.canvasWebp, wasm: this.wasm.available() });
    if (backend === 'canvas') return this.canvas.compress(image, size, quality, signal);
    if (backend === 'wasm') return this.wasm.compress(image, size, quality, signal);
    throw new WebpUnsupportedError(`cannot encode ${POST_IMAGE_CONTENT_TYPE} (max long edge ${POST_IMAGE_MAX_LONG_EDGE})`);
  }
}
