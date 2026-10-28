import type { DecodedImage, DecodeOptions, ImageDecoder, WebpCompressor } from './imagePorts';
import type { Size } from './imageSizing';

/**
 * 브라우저 구현 자리(구현 단계): createImageBitmap(imageOrientation: 'from-image', resizeWidth/Height로 디코드 단계 축소) 기반 디코더와
 * canvas.toBlob('image/webp') / WASM 인코더 압축기. jsdom에서 테스트하지 않으며 인터페이스(imagePorts.ts)와 selectWebpBackend 규칙만 고정한다.
 */
export class BrowserImageDecoder implements ImageDecoder {
  decode(_source: Blob, _options: DecodeOptions, _signal: AbortSignal): Promise<DecodedImage> {
    throw new Error('not implemented');
  }
}

export class BrowserWebpCompressor implements WebpCompressor {
  compress(_image: DecodedImage, _size: Size, _quality: number, _signal: AbortSignal): Promise<Blob> {
    throw new Error('not implemented');
  }
}
