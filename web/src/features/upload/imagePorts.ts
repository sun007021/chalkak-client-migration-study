import type { PhotoEdit } from './editModel';
import type { Size } from './imageSizing';

/**
 * 이미지 준비 파이프라인의 포트(인터페이스). 실제 구현(canvas / createImageBitmap / WASM)은 구현 단계에서 만들고 jsdom에서는 테스트하지 않는다.
 * 단위 테스트는 src/test의 FakeImageDecoder, FakeEditRenderer, FakeWebpCompressor를 쓴다.
 */

/** 디코드된 이미지 핸들. 쓴 쪽이 release()로 놓아 준다(ImageBitmap.close 등). */
export interface DecodedImage {
  /** EXIF 방향이 이미 반영된, 화면에 보이는 방향의 크기. */
  readonly width: number;
  readonly height: number;
  release(): void;
}

/** 브라우저 canvas가 그릴 수 있는 이미지(BrowserDecodedImage). 편집·압축 구현이 포트 밖에서 캐스트하지 않도록 타입 가드로 좁힌다. */
export interface DrawableImage extends DecodedImage {
  readonly drawable: CanvasImageSource;
}

export function isDrawableImage(image: DecodedImage): image is DrawableImage {
  return 'drawable' in image && (image as { drawable?: unknown }).drawable != null;
}

export interface DecodeOptions {
  /** 원본의 긴 변이 이 값을 넘으면 디코드 단계에서 줄여 읽는다. 결과 긴 변은 이 값 이하이고 확대하지 않는다. */
  maxLongEdge: number;
}

export interface ImageDecoder {
  /**
   * 크기만 확인한다(사진 선택 직후 검사용). 전체 해상도 비트맵을 만들지 않는다: 읽을 수 있는 이미지인지(헤더·디코드 가능 여부)와
   * EXIF 방향을 반영한 원본의 보이는 크기를 돌려준다. 읽을 수 없으면 ImageDecodeError, signal abort는 AbortError.
   */
  probe(source: Blob, signal: AbortSignal): Promise<Size>;
  /**
   * EXIF 방향을 반영해 디코드한다. 움직이는 이미지는 첫 프레임만. 비어 있거나 읽을 수 없거나 지원하지 않는 형식이면 ImageDecodeError.
   * signal이 abort되면 AbortError로 거절한다.
   */
  decode(source: Blob, options: DecodeOptions, signal: AbortSignal): Promise<DecodedImage>;
}

/** 편집값을 적용해 새 이미지를 만든다(PIE 순서: 디코드 → EXIF → 편집 적용 → 인코딩). 입력 image는 release하지 않는다. 기본 구현 IdentityEditRenderer는 편집기 PR(W7b) 전까지 원본 그대로다. */
export interface EditRenderer {
  render(image: DecodedImage, edit: PhotoEdit, signal: AbortSignal): Promise<DecodedImage>;
}

/**
 * 손실(lossy) 정지 WebP 한 번 압축. size 크기로 그려 quality(0~100 정수)로 인코딩한 Blob을 돌려준다.
 * 이 플랫폼이 image/webp를 만들 수 없으면 PNG/JPEG로 대신하지 말고 WebpUnsupportedError를 던진다(canvas가 지원하지 않으면 WASM).
 */
export interface WebpCompressor {
  compress(image: DecodedImage, size: Size, quality: number, signal: AbortSignal): Promise<Blob>;
}

/** canvas가 image/webp를 못 만들 때 쓰는 WASM 인코더. available()이 false면 선택되지 않는다. */
export interface WasmWebpEncoder extends WebpCompressor {
  available(): boolean;
}

export class ImageDecodeError extends Error {
  readonly name = 'ImageDecodeError';
}

/** 압축 결과가 RIFF/WEBP 정지 이미지가 아니다(canvas.toBlob이 조용히 PNG를 돌려주는 경우 등). 다른 형식으로 폴백하지 않는다. */
export class NotWebpError extends Error {
  readonly name = 'NotWebpError';
  constructor(readonly reason: string) {
    super(`not a still webp: ${reason}`);
  }
}

/** 4라운드(축소 3회) 안에 maxBytes 이하가 되지 못했다. */
export class SizeLimitExceededError extends Error {
  readonly name = 'SizeLimitExceededError';
}

/** 이 환경에서 image/webp로 인코딩할 방법이 없다(canvas도 WASM도 불가). */
export class WebpUnsupportedError extends Error {
  readonly name = 'WebpUnsupportedError';
}

/** 기본 EditRenderer. 편집기(W7b)가 들어오기 전에는 받은 이미지를 그대로 돌려준다. */
export class IdentityEditRenderer implements EditRenderer {
  render(image: DecodedImage, _edit: PhotoEdit, _signal: AbortSignal): Promise<DecodedImage> {
    return Promise.resolve(image);
  }
}
