import type { GeometryPlan } from '../features/upload/editor/cropGeometry';
import type { PixelSurface, PixelSurfaceFactory } from '../features/upload/editor/editorPorts';
import type { DecodedImage } from '../features/upload/imagePorts';
import type { Size } from '../features/upload/imageSizing';
import { FakeDecodedImage } from './FakeImageDecoder';

/** 실제 canvas 없이 RGBA 버퍼를 들고 있는 표면 Fake. 호출 순서를 `log`에 남기고 drawGeometry는 fill 색으로 채운다. */
export class FakePixelSurface implements PixelSurface {
  readonly log: string[] = [];
  readonly plans: GeometryPlan[] = [];
  readonly drawn: DecodedImage[] = [];
  readonly outputs: FakeDecodedImage[] = [];
  released = 0;
  private pixels: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number,
    fill: readonly [number, number, number, number],
  ) {
    this.pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < this.pixels.length; i += 4) this.pixels.set(fill, i);
  }

  drawGeometry(image: DecodedImage, plan: GeometryPlan): void {
    this.log.push('drawGeometry');
    this.drawn.push(image);
    this.plans.push(plan);
  }
  readPixels(): Uint8ClampedArray {
    this.log.push('readPixels');
    return this.pixels;
  }
  writePixels(pixels: Uint8ClampedArray): void {
    this.log.push('writePixels');
    this.pixels = pixels;
  }
  toImage(): DecodedImage {
    this.log.push('toImage');
    const out = new FakeDecodedImage(this.width, this.height);
    const release = out.release.bind(out);
    out.release = () => {
      this.released += 1;
      release();
    };
    this.outputs.push(out);
    return out;
  }
  /** 지금 표면 픽셀(검사용). */
  snapshot(): Uint8ClampedArray {
    return this.pixels;
  }
}

/** 만든 표면을 모두 기록하는 팩토리. fill로 채운 불투명 단색 표면을 만든다. */
export function fakeSurfaceFactory(fill: readonly [number, number, number, number] = [128, 128, 128, 255]) {
  const surfaces: FakePixelSurface[] = [];
  const create: PixelSurfaceFactory = (size: Size) => {
    const surface = new FakePixelSurface(size.width, size.height, fill);
    surfaces.push(surface);
    return surface;
  };
  return { create, surfaces };
}
