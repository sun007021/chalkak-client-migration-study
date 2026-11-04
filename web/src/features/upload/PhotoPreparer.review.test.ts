import { PhotoPreparer, PrepareError, toPrepareError } from './PhotoPreparer';
import { ImageDecodeError } from './imagePorts';
import type { DecodedImage, ImageDecoder } from './imagePorts';
import { imageFile } from '../../test/FakeImageDecoder';
import { createUploadHarness } from '../../test/uploadHarness';

describe('리뷰 6: inspect는 probe(전체 디코드 없이 크기만)를 쓴다', () => {
  function withDecoder(decoder: ImageDecoder): PhotoPreparer {
    const h = createUploadHarness();
    return new PhotoPreparer({ repository: h.repository, decoder, compressor: h.compressor, renderer: h.renderer, clock: h.clock });
  }
  const signal = () => new AbortController().signal;

  it('리뷰 6 inspect는 decode를 부르지 않고 probe 크기를 긴 변 4096으로 맞춰 돌려준다', async () => {
    const decode = vi.fn<ImageDecoder['decode']>(() => Promise.reject(new Error('inspect must not decode')));
    const probe = vi.fn<ImageDecoder['probe']>(() => Promise.resolve({ width: 8000, height: 6000 }));
    const preparer = withDecoder({ decode, probe });
    const photo = imageFile();
    await expect(preparer.inspect(photo, signal())).resolves.toEqual({ width: 4096, height: 3072 });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe.mock.calls[0]![0]).toBe(photo);
    expect(decode).not.toHaveBeenCalled();
  });

  it('리뷰 6 probe 실패는 PrepareError(prepare)다', async () => {
    const preparer = withDecoder({ decode: () => Promise.reject(new Error('x')), probe: () => Promise.reject(new ImageDecodeError('bad')) });
    await expect(preparer.inspect(imageFile(), signal())).rejects.toMatchObject({ name: 'PrepareError', kind: 'prepare' });
  });

  it('리뷰 6 probe 취소는 AbortError 그대로다', async () => {
    const controller = new AbortController();
    const preparer = withDecoder({
      decode: () => Promise.reject(new Error('x')),
      probe: () => {
        controller.abort();
        return Promise.resolve({ width: 10, height: 10 });
      },
    });
    await expect(preparer.inspect(imageFile(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('리뷰 10: PrepareError 변환 한 곳', () => {
  it('리뷰 10 toPrepareError는 PrepareError를 그대로, 그 밖은 prepare로 감싼다', () => {
    const own = new PrepareError('network');
    expect(toPrepareError(own)).toBe(own);
    const wrapped = toPrepareError(new Error('boom'));
    expect(wrapped).toBeInstanceOf(PrepareError);
    expect(wrapped.kind).toBe('prepare');
  });
});

describe('리뷰 6: DecodedImage 반환 타입', () => {
  it('리뷰 6 DecodedImage 모양은 그대로다', () => {
    const image: DecodedImage = { width: 1, height: 1, release: () => {} };
    expect(image.width).toBe(1);
  });
});
