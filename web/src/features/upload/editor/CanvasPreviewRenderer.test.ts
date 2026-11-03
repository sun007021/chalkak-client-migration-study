import { IDENTITY_EDIT } from '../editModel';
import { FakeDecodedImage } from '../../../test/FakeImageDecoder';
import { fakeSurfaceFactory } from '../../../test/FakePixelSurface';
import { FakeBlobUrls } from '../../../test/FakeBlobUrls';
import { CanvasPreviewRenderer } from './canvasPorts';

const signal = () => new AbortController().signal;

describe('코드 리뷰 2: 미리보기는 1440 이하 프록시에서 그린다', () => {
  it('큰 원본은 한 번만 프록시로 줄이고, 이후 미리보기·썸네일은 프록시에서 그린다', async () => {
    const { create, surfaces } = fakeSurfaceFactory();
    const renderer = new CanvasPreviewRenderer({ createSurface: create, blobUrls: new FakeBlobUrls(), toBlob: async () => new Blob(['x']) });
    const original = new FakeDecodedImage(4096, 3072);
    const a = await renderer.render(original, IDENTITY_EDIT, { maxLongEdge: 1440 }, signal());
    const b = await renderer.render(original, { ...IDENTITY_EDIT, filter: 'mono' }, { maxLongEdge: 96 }, signal());
    // 원본을 그린 표면은 프록시 하나뿐이다.
    const drawnFromOriginal = surfaces.filter((s) => s.drawn.includes(original));
    expect(drawnFromOriginal).toHaveLength(1);
    expect([drawnFromOriginal[0]!.width, drawnFromOriginal[0]!.height]).toEqual([1440, 1080]);
    expect([a.width, a.height]).toEqual([1440, 1080]);
    expect([b.width, b.height]).toEqual([96, 72]);
  });

  it('원본이 이미 1440 이하면 프록시 없이 원본에서 그린다', async () => {
    const { create, surfaces } = fakeSurfaceFactory();
    const renderer = new CanvasPreviewRenderer({ createSurface: create, blobUrls: new FakeBlobUrls(), toBlob: async () => new Blob(['x']) });
    const small = new FakeDecodedImage(800, 600);
    await renderer.render(small, IDENTITY_EDIT, { maxLongEdge: 1440 }, signal());
    expect(surfaces.filter((s) => s.drawn.includes(small))).toHaveLength(1);
    expect(surfaces).toHaveLength(1);
  });

  it('forget은 프록시를 놓아 준다', async () => {
    const { create, surfaces } = fakeSurfaceFactory();
    const renderer = new CanvasPreviewRenderer({ createSurface: create, blobUrls: new FakeBlobUrls(), toBlob: async () => new Blob(['x']) });
    const original = new FakeDecodedImage(4096, 3072);
    await renderer.render(original, IDENTITY_EDIT, { maxLongEdge: 1440 }, signal());
    renderer.forget(original);
    // 프록시 표면 결과 이미지가 release된다(surface.released는 toImage 결과 release 횟수).
    expect(surfaces[0]!.released).toBe(1);
  });
});
