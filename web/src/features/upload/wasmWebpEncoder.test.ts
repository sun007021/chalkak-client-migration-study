import { WebpUnsupportedError } from './imagePorts';
import type { DecodedImage } from './imagePorts';
import { BrowserWebpCompressor } from './browserImage';
import { blobBytes, webpBlob } from './webpMetadata';

const image: DecodedImage = { width: 4, height: 4, release: () => {} };
const size = { width: 4, height: 4 };
const signal = () => new AbortController().signal;
const canvasOk = { compress: vi.fn(async () => new Blob(['canvas'], { type: 'image/webp' })) };

describe('리뷰 5: canvas가 안 되면 WASM, 둘 다 안 되면 준비 실패', () => {
  it('리뷰 5 canvas WebP가 안 되면 wasm 인코더를 쓴다', async () => {
    const wasm = { available: () => true, compress: vi.fn(async () => new Blob(['wasm'], { type: 'image/webp' })) };
    const compressor = new BrowserWebpCompressor(canvasOk, wasm, async () => false);
    const blob = await compressor.compress(image, size, 80, signal());
    expect(await blob.text()).toBe('wasm');
    expect(wasm.compress).toHaveBeenCalledTimes(1);
  });

  it('리뷰 5 canvas도 wasm도 안 되면 WebpUnsupportedError이고 PNG/JPEG로 대신하지 않는다', async () => {
    const wasm = { available: () => false, compress: vi.fn() };
    const compressor = new BrowserWebpCompressor(canvasOk, wasm, async () => false);
    await expect(compressor.compress(image, size, 80, signal())).rejects.toBeInstanceOf(WebpUnsupportedError);
    expect(wasm.compress).not.toHaveBeenCalled();
  });

  it('리뷰 10 canvas 지원 확인은 성공만 기억한다(일시 실패 뒤 다시 확인)', async () => {
    const probe = vi.fn<() => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValueOnce(true).mockResolvedValue(true);
    const wasm = { available: () => false, compress: vi.fn() };
    const compressor = new BrowserWebpCompressor(canvasOk, wasm, probe);
    await expect(compressor.compress(image, size, 80, signal())).rejects.toBeInstanceOf(WebpUnsupportedError);
    await expect(compressor.compress(image, size, 80, signal())).resolves.toBeInstanceOf(Blob);
    await compressor.compress(image, size, 80, signal());
    expect(probe).toHaveBeenCalledTimes(2);
  });
});

describe('리뷰 10: 인코딩 결과 바이트를 한 번만 읽는다', () => {
  it('리뷰 10 webpBlob으로 만든 Blob은 arrayBuffer 없이 같은 바이트를 돌려준다', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const blob = webpBlob(bytes);
    const spy = vi.spyOn(blob, 'arrayBuffer');
    expect(await blobBytes(blob)).toBe(bytes);
    expect(spy).not.toHaveBeenCalled();
    expect(blob.type).toBe('image/webp');
  });

  it('리뷰 10 모르는 Blob은 arrayBuffer로 읽는다', async () => {
    const blob = new Blob([new Uint8Array([9, 8])], { type: 'image/webp' });
    expect(Array.from(await blobBytes(blob))).toEqual([9, 8]);
  });
});
