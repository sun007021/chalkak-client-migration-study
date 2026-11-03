import { PhotoPreparer } from '../PhotoPreparer';
import { IDENTITY_EDIT } from '../editModel';
import type { PhotoEdit } from '../editModel';
import { imageFile } from '../../../test/FakeImageDecoder';
import { fakeSurfaceFactory } from '../../../test/FakePixelSurface';
import { finish } from '../../../test/homeHarness';
import { createUploadHarness } from '../../../test/uploadHarness';
import { CanvasEditRenderer } from './CanvasEditRenderer';

/** 편집값을 넘기는 방식(REQ-EDIT-002)의 끝에서 끝: 업로드 준비(PhotoPreparer)가 실제 CanvasEditRenderer로 같은 값을 다시 그려 한 번만 압축하는지. */
function setup() {
  const h = createUploadHarness();
  const { create, surfaces } = fakeSurfaceFactory([200, 120, 60, 255]);
  const preparer = new PhotoPreparer({ repository: h.repository, decoder: h.decoder, compressor: h.compressor, renderer: new CanvasEditRenderer({ createSurface: create }), clock: h.clock });
  const prepare = (photo: Blob, edit: PhotoEdit) => finish(h, preparer.prepare({ photo, edit }, new AbortController().signal));
  return { h, surfaces, prepare };
}

describe('편집값 → 업로드 준비 파이프라인 (PIE: 디코드 → EXIF → 편집 적용 → 인코딩)', () => {
  it('TC-EDIT-010 TC-EDIT-003 편집한 사진은 4096 이하로 읽어 편집값을 한 번 적용하고, 그 결과를 손실 압축 한 번(첫 라운드)으로 인코딩한다', async () => {
    const { h, surfaces, prepare } = setup();
    const edit: PhotoEdit = { ...IDENTITY_EDIT, filter: 'warm', crop: { centerX: 0.5, centerY: 0.5, width: 0.5, height: 0.5 } };
    const prepared = await prepare(imageFile({ width: 8000, height: 6000 }), edit);
    expect(h.decoder.calls[0]!.maxLongEdge).toBe(4096);
    expect(surfaces).toHaveLength(1); // 편집 재그리기 1회
    expect(surfaces[0]!.width).toBe(2048);
    expect(surfaces[0]!.height).toBe(1536);
    expect(h.compressor.compressCount).toBe(1); // 중간 JPEG 같은 추가 손실 압축 없이 WebP 한 번
    expect(h.compressor.calls[0]!.image).toBe(surfaces[0]!.outputs[0]); // 압축 입력은 편집 결과
    expect(h.compressor.calls[0]).toMatchObject({ width: 2048, height: 1536, quality: 90 });
    expect(prepared.size).toEqual({ width: 2048, height: 1536 });
    expect(prepared.file.type).toBe('image/webp');
  });

  it('TC-EDIT-010 디코드한 원본과 편집 결과는 쓰고 나면 release된다', async () => {
    const { h, surfaces, prepare } = setup();
    await prepare(imageFile({ width: 4000, height: 3000 }), { ...IDENTITY_EDIT, filter: 'mono' });
    expect(h.decoder.images[0]!.releases).toBe(1);
    expect(surfaces[0]!.released).toBe(1);
  });

  it('TC-EDIT-011 편집하지 않은 사진은 편집 재그리기를 건너뛰고 디코드한 이미지를 그대로 압축한다', async () => {
    const { h, surfaces, prepare } = setup();
    await prepare(imageFile({ width: 4000, height: 3000 }), IDENTITY_EDIT);
    expect(surfaces).toHaveLength(0);
    expect(h.compressor.calls[0]!.image).toBe(h.decoder.images[0]);
  });

  it('TC-EDIT-020 큰 사진과 중앙 25%×25% 자르기: 먼저 4096 이하로 줄인 뒤 자르므로 출력은 약 1000×750(정확히는 1024×768)이다', async () => {
    const { surfaces, prepare, h } = setup();
    const prepared = await prepare(imageFile({ width: 8000, height: 6000 }), { ...IDENTITY_EDIT, crop: { centerX: 0.5, centerY: 0.5, width: 0.25, height: 0.25 } });
    expect(surfaces[0]!.plans[0]!.output).toEqual({ width: 1024, height: 768 });
    expect(prepared.size).toEqual({ width: 1024, height: 768 });
    expect(h.compressor.calls[0]).toMatchObject({ width: 1024, height: 768 });
  });
});
