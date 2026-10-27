import type { Size, Stroke } from './Stroke';
import type { SignatureRasterizer } from './SignatureRasterizer';

/** PNG가 SIGNATURE_MAX_BYTES(1 MiB)를 넘었다. 서버를 부르지 않고 sign.error.too-large를 보인다. */
export class SignatureTooLargeError extends Error {}

/** 획을 정규화(fitStrokesToPng)해 래스터라이저에 맡기고 크기를 검사한다. 빈 사인은 거부한다. */
export class SignatureEncoder {
  constructor(private readonly rasterizer: SignatureRasterizer) {}

  async encode(_strokes: readonly Stroke[], _canvas: Size): Promise<Uint8Array> {
    throw new Error('not implemented');
  }
}
