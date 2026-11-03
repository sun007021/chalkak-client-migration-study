import { POST_IMAGE_CONTENT_TYPE, POST_IMAGE_MAX_LONG_EDGE } from '../../constants';
import { CanvasWebpCompressor, probeCanvasWebp } from './CanvasWebpCompressor';
import { ImageDecodeError, WebpUnsupportedError } from './imagePorts';
import type { DecodedImage, DecodeOptions, ImageDecoder, WebpCompressor } from './imagePorts';
import { fitLongEdge } from './imageSizing';
import type { Size } from './imageSizing';
import { selectWebpBackend } from './postImageEncoder';

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

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

/**
 * createImageBitmap(imageOrientation: 'from-image', resizeWidth/Height)로 디코드 단계에서 목표 크기만 만든다(전체 해상도 비트맵을 만들지 않는다, REQ-UPL-027).
 * createImageBitmap이 없거나 옵션을 받지 못하면 <img>를 목표 크기 canvas에 그려 대신한다. 움직이는 이미지는 첫 프레임만 쓴다.
 */
export class BrowserImageDecoder implements ImageDecoder {
  async decode(source: Blob, options: DecodeOptions, signal: AbortSignal): Promise<DecodedImage> {
    if (signal.aborted) throw abortError();
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
      return new BrowserDecodedImage(this.drawToCanvas(element, target), target.width, target.height);
    } finally {
      revoke();
    }
  }

  /** 지원하지 않거나 실패하면 null(호출한 쪽이 <img> + canvas로 대신한다). */
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
    } catch {
      return null;
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

/**
 * WASM WebP 인코더 자리(TODO: 의존성을 더하지 않고 인터페이스만 둔다). available()이 false인 환경에서는 canvas도 안 되면 "인코딩 불가"로 끝난다.
 * PNG/JPEG로 대신하는 경로는 없다(REQ-UPL-032~033).
 */
export interface WasmWebpEncoder extends WebpCompressor {
  available(): boolean;
}

export class UnavailableWasmWebpEncoder implements WasmWebpEncoder {
  available(): boolean {
    return false;
  }
  compress(): Promise<Blob> {
    return Promise.reject(new WebpUnsupportedError('wasm webp encoder is not available'));
  }
}

/** 기본 WebP 압축기: canvas가 image/webp를 만들면 canvas, 아니면 WASM, 둘 다 안 되면 WebpUnsupportedError. 지원 여부는 한 번만 확인한다. */
export class BrowserWebpCompressor implements WebpCompressor {
  private support: Promise<boolean> | null = null;

  constructor(
    private readonly canvas: WebpCompressor = new CanvasWebpCompressor(),
    private readonly wasm: WasmWebpEncoder = new UnavailableWasmWebpEncoder(),
    private readonly probe: () => Promise<boolean> = probeCanvasWebp,
  ) {}

  async compress(image: DecodedImage, size: Size, quality: number, signal: AbortSignal): Promise<Blob> {
    this.support ??= this.probe();
    const backend = selectWebpBackend({ canvasWebp: await this.support, wasm: this.wasm.available() });
    if (backend === 'canvas') return this.canvas.compress(image, size, quality, signal);
    if (backend === 'wasm') return this.wasm.compress(image, size, quality, signal);
    throw new WebpUnsupportedError(`cannot encode ${POST_IMAGE_CONTENT_TYPE} (max long edge ${POST_IMAGE_MAX_LONG_EDGE})`);
  }
}
