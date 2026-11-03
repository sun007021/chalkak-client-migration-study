import { IDENTITY_EDIT } from '../editModel';
import type { PhotoEdit } from '../editModel';
import { POST_IMAGE_MAX_LONG_EDGE } from '../../../constants';
import { FakeDecodedImage, FakeImageDecoder, imageFile } from '../../../test/FakeImageDecoder';
import { fakeSurfaceFactory } from '../../../test/FakePixelSurface';
import { expectRgbNear, pixelAt } from '../../../test/pixels';
import { CanvasEditRenderer } from './CanvasEditRenderer';

const signal = () => new AbortController().signal;
const edit = (patch: Partial<PhotoEdit>): PhotoEdit => ({ ...IDENTITY_EDIT, ...patch });
const layers = (manual: PhotoEdit['adjustmentLayers']['manual']): PhotoEdit['adjustmentLayers'] => ({ ...IDENTITY_EDIT.adjustmentLayers, manual });

function setup(fill: readonly [number, number, number, number] = [128, 128, 128, 255]) {
  const { create, surfaces } = fakeSurfaceFactory(fill);
  const renderer = new CanvasEditRenderer({ createSurface: create });
  return { renderer, surfaces };
}

describe('CanvasEditRenderer 포트 계약 (REQ-EDIT-002, 008, 018; 실제 canvas는 Playwright로 확인)', () => {
  it('TC-EDIT-046 순서: 기하(그리기) → 픽셀 읽기 → 색 연산 → 픽셀 쓰기 → 결과 이미지', async () => {
    const { renderer, surfaces } = setup();
    await renderer.render(new FakeDecodedImage(4, 4), edit({ filter: 'mono' }), signal());
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]!.log).toEqual(['drawGeometry', 'readPixels', 'writePixels', 'toImage']);
  });

  it('TC-EDIT-046 크롭·회전·흑백·노출을 조합한 4×4 입력: 출력은 2×4이고 픽셀은 회색 162(노출 +0.5 → 흑백)다', async () => {
    // 4×4를 시계 방향으로 한 번 돌려도 4×4. 돌린 사진의 왼쪽 절반(width 0.5, height 1)을 잘라 2×4. 표면 색 128 → 노출 +0.5 → 162 → 흑백(162)
    const { renderer, surfaces } = setup();
    const image = new FakeDecodedImage(4, 4);
    const output = await renderer.render(
      image,
      edit({ quarterTurns: 1, crop: { centerX: 0.5, centerY: 0.75, width: 0.5, height: 1 }, filter: 'mono', adjustmentLayers: layers({ exposure: 0.5 }) }),
      signal(),
    );
    expect([output.width, output.height]).toEqual([2, 4]);
    const surface = surfaces[0]!;
    expect([surface.width, surface.height]).toEqual([2, 4]);
    expect(surface.plans[0]).toMatchObject({ quarterTurns: 1, rotatedRect: { x: 0, y: 0, width: 2, height: 4 }, output: { width: 2, height: 4 } });
    expect(surface.drawn).toEqual([image]);
    const pixels = surface.snapshot();
    expect(pixels.length).toBe(2 * 4 * 4);
    for (let i = 0; i < 8; i += 1) expectRgbNear(pixelAt(pixels, i), [162, 162, 162], 2);
  });

  it('TC-EDIT-029 REQ-EDIT-008 조정이 먼저, 필터는 그 다음이다: 회색 100 + 블랙 포인트 +1 + 따뜻하게 → (45, 39, 30)', async () => {
    const { renderer, surfaces } = setup([100, 100, 100, 255]);
    await renderer.render(new FakeDecodedImage(2, 2), edit({ filter: 'warm', adjustmentLayers: layers({ blackPoint: 1 }) }), signal());
    expectRgbNear(pixelAt(surfaces[0]!.snapshot(), 0), [45, 39, 30], 2);
  });

  it('REQ-EDIT-022 조정 값은 직접 값 또는 자동값 × 강도로 적용한다', async () => {
    const { renderer, surfaces } = setup();
    const autoValues = { ...IDENTITY_EDIT.adjustmentLayers.autoValues, exposure: 1 };
    await renderer.render(new FakeDecodedImage(1, 1), edit({ adjustmentLayers: { autoValues, autoStrength: 0.5, manual: {} } }), signal());
    // 노출 0.5 → 162 (TC-EDIT-024)
    expectRgbNear(pixelAt(surfaces[0]!.snapshot(), 0), [162, 162, 162], 2);
  });

  it('REQ-EDIT-002 색 연산이 없으면(회전·자르기만) 픽셀을 읽거나 쓰지 않는다', async () => {
    const { renderer, surfaces } = setup();
    await renderer.render(new FakeDecodedImage(4, 3), edit({ quarterTurns: 1 }), signal());
    expect(surfaces[0]!.log).toEqual(['drawGeometry', 'toImage']);
    expect([surfaces[0]!.width, surfaces[0]!.height]).toEqual([3, 4]);
  });

  it('TC-EDIT-040 필터를 적용해도 이미지 크기가 유지된다', async () => {
    const { renderer } = setup();
    const output = await renderer.render(new FakeDecodedImage(640, 480), edit({ filter: 'vintage' }), signal());
    expect([output.width, output.height]).toEqual([640, 480]);
  });

  it('TC-EDIT-020 큰 사진은 디코더가 4096으로 줄인 이미지에 자르기를 적용한다: 8000×6000 + 중앙 25%×25% → 1024×768', async () => {
    const decoder = new FakeImageDecoder();
    const decoded = await decoder.decode(imageFile({ width: 8000, height: 6000 }), { maxLongEdge: POST_IMAGE_MAX_LONG_EDGE }, signal());
    expect([decoded.width, decoded.height]).toEqual([4096, 3072]);
    const { renderer, surfaces } = setup();
    const output = await renderer.render(decoded, edit({ crop: { centerX: 0.5, centerY: 0.5, width: 0.25, height: 0.25 } }), signal());
    expect([output.width, output.height]).toEqual([1024, 768]);
    expect(surfaces[0]!.plans[0]!.rotatedRect).toEqual({ x: 1536, y: 1152, width: 1024, height: 768 });
  });

  it('입력 이미지는 release하지 않고 결과 이미지가 표면을 놓는다', async () => {
    const { renderer, surfaces } = setup();
    const image = new FakeDecodedImage(4, 4);
    const output = await renderer.render(image, edit({ filter: 'cool' }), signal());
    expect(image.releases).toBe(0);
    expect(surfaces[0]!.released).toBe(0);
    output.release();
    expect(surfaces[0]!.released).toBe(1);
  });

  it('이미 abort된 signal이면 AbortError로 거절하고 표면을 만들지 않는다', async () => {
    const { renderer, surfaces } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(renderer.render(new FakeDecodedImage(4, 4), edit({ filter: 'mono' }), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(surfaces).toHaveLength(0);
  });

  it('TC-EDIT-008 표면을 만들지 못하면 그 오류를 그대로 던진다(호출한 쪽이 준비 실패로 본다)', async () => {
    const boom = new Error('no canvas');
    const renderer = new CanvasEditRenderer({
      createSurface: () => {
        throw boom;
      },
    });
    await expect(renderer.render(new FakeDecodedImage(4, 4), edit({ filter: 'mono' }), signal())).rejects.toBe(boom);
  });
});
