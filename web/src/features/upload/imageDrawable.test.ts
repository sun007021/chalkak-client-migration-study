import { isDrawableImage } from './imagePorts';
import { FakeDecodedImage } from '../../test/FakeImageDecoder';

describe('코드 리뷰 6: 그릴 수 있는 이미지 판별은 타입 가드다(포트에 캐스트가 새지 않는다)', () => {
  it('drawable이 있는 이미지만 DrawableImage로 본다', () => {
    const bitmapLike = { width: 2, height: 2, drawable: {} as CanvasImageSource, release: () => undefined };
    expect(isDrawableImage(bitmapLike)).toBe(true);
    expect(isDrawableImage(new FakeDecodedImage(2, 2))).toBe(false);
  });
});
