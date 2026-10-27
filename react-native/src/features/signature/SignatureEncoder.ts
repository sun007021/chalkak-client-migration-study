import { SIGNATURE_MAX_BYTES, SIGNATURE_PNG_SIZE } from '../../shared/constants';
import { fitStrokesToPng } from './SignatureLayout';
import type { Size, Stroke } from './Stroke';
import type { SignatureRasterizer } from './SignatureRasterizer';

/** PNG가 SIGNATURE_MAX_BYTES(1 MiB)를 넘었다. 서버를 부르지 않고 sign.error.too-large를 보인다. */
export class SignatureTooLargeError extends Error {}

/** 획을 정규화(fitStrokesToPng)해 래스터라이저에 맡기고 크기를 검사한다. 빈 사인은 거부한다. */
export class SignatureEncoder {
  constructor(private readonly rasterizer: SignatureRasterizer) {}

  async encode(strokes: readonly Stroke[], canvas: Size): Promise<Uint8Array> {
    const drawable = strokes.filter((stroke) => stroke.length > 0);
    if (drawable.length === 0) throw new Error('저장할 사인이 없습니다.');
    const { width, height, strokeWidth } = SIGNATURE_PNG_SIZE;
    const fitted = fitStrokesToPng(drawable, canvas, SIGNATURE_PNG_SIZE);
    if (fitted.length === 0) throw new Error('저장할 사인이 없습니다.'); // 유한한 좌표가 하나도 없다
    const png = await this.rasterizer.rasterize({ width, height, strokeWidth, strokes: fitted });
    if (png.byteLength > SIGNATURE_MAX_BYTES) throw new SignatureTooLargeError();
    return png;
  }
}
