// Playwright 테스트 전용 번들 진입점: 앱 번들(dist)에는 들어가지 않는다. upload-encoder.spec.ts가 vite로 따로 묶어 페이지에 주입한다.
import { POST_IMAGE_CONTENT_TYPE, POST_IMAGE_MAX_BYTES } from '../../src/constants';
import { BrowserImageDecoder, BrowserWebpCompressor } from '../../src/features/upload/browserImage';
import { CanvasWebpCompressor } from '../../src/features/upload/CanvasWebpCompressor';
import { encodePostImage, inspectWebp } from '../../src/features/upload/postImageEncoder';

export interface EncodeReport {
  decodedWidth: number;
  decodedHeight: number;
  type: string;
  size: number;
  width: number;
  height: number;
  quality: number;
  attempts: number;
  header: string;
  form: string;
  inspection: ReturnType<typeof inspectWebp>;
}

/** 소스를 디코드하고 정책 maxBytes로 인코딩한 결과를 요약한다. 디코드한 이미지는 놓는다. */
export async function encodeFile(source: Blob, maxBytes: number = POST_IMAGE_MAX_BYTES): Promise<EncodeReport> {
  const controller = new AbortController();
  const image = await new BrowserImageDecoder().decode(source, { maxLongEdge: 4096 }, controller.signal);
  try {
    const encoded = await encodePostImage({ image, compressor: new BrowserWebpCompressor(), maxBytes, signal: controller.signal });
    const bytes = new Uint8Array(await encoded.blob.arrayBuffer());
    const text = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
    return {
      decodedWidth: image.width,
      decodedHeight: image.height,
      type: encoded.blob.type,
      size: encoded.blob.size,
      width: encoded.width,
      height: encoded.height,
      quality: encoded.quality,
      attempts: encoded.attempts,
      header: text(0, 4),
      form: text(8, 12),
      inspection: inspectWebp(bytes),
    };
  } finally {
    image.release();
  }
}

/** 디코드만(크기 확인). */
export async function decodeSize(source: Blob, maxLongEdge: number): Promise<{ width: number; height: number }> {
  const image = await new BrowserImageDecoder().decode(source, { maxLongEdge }, new AbortController().signal);
  const size = { width: image.width, height: image.height };
  image.release();
  return size;
}

/** 디코드 실패 이름(ImageDecodeError 등). 성공하면 null. */
export async function decodeFailure(source: Blob): Promise<string | null> {
  try {
    (await new BrowserImageDecoder().decode(source, { maxLongEdge: 4096 }, new AbortController().signal)).release();
    return null;
  } catch (error) {
    return (error as Error).name;
  }
}

/** canvas가 직접 image/webp를 만드는지(CanvasWebpCompressor) 확인한다. */
export async function canvasProducesWebp(source: Blob): Promise<string> {
  const controller = new AbortController();
  const image = await new BrowserImageDecoder().decode(source, { maxLongEdge: 4096 }, controller.signal);
  try {
    const blob = await new CanvasWebpCompressor().compress(image, { width: 16, height: 16 }, 80, controller.signal);
    return blob.type;
  } finally {
    image.release();
  }
}

export { POST_IMAGE_CONTENT_TYPE };
