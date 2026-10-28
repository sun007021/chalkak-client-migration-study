import type { RasterRequest, SignatureRasterizer } from '../SignatureRasterizer';

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** 요청을 기록하고 정해진 크기의 바이트를 돌려준다(PNG 시그니처로 시작). 실제 그리기는 하지 않는다. */
export class FakeSignatureRasterizer implements SignatureRasterizer {
  readonly requests: RasterRequest[] = [];
  private size = 64;
  private failure: Error | null = null;

  setSize(bytes: number): this {
    this.size = bytes;
    return this;
  }

  failWith(error: Error): this {
    this.failure = error;
    return this;
  }

  rasterize(request: RasterRequest): Promise<Uint8Array> {
    this.requests.push(request);
    if (this.failure) return Promise.reject(this.failure);
    const bytes = new Uint8Array(this.size);
    bytes.set(PNG_HEADER.slice(0, Math.min(8, this.size)));
    return Promise.resolve(bytes);
  }
}
