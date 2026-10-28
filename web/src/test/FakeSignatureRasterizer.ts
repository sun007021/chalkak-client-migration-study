import type { SignatureDrawing } from '../features/signature/SignaturePad';
import type { SignatureRasterizer } from '../features/signature/SignatureRasterizer';

/** PNG 시그니처 8바이트(89 50 4E 47 0D 0A 1A 0A). */
export const PNG_SIGNATURE_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** 시그니처로 시작하는 byteLength 바이트짜리 image/png Blob. */
export function fakePng(byteLength = 64): Blob {
  const bytes = new Uint8Array(Math.max(byteLength, PNG_SIGNATURE_BYTES.length));
  bytes.set(PNG_SIGNATURE_BYTES);
  return new Blob([bytes], { type: 'image/png' });
}

/** 실제 canvas 없이 정해진 크기의 PNG를 돌려주는 Fake. 호출마다 새 Blob. size를 바꾸면 이후 호출에 반영, fail을 주면 그 오류로 거절. */
export class FakeSignatureRasterizer implements SignatureRasterizer {
  readonly drawings: SignatureDrawing[] = [];
  readonly results: Blob[] = [];
  size = 64;
  fail: Error | null = null;
  private gate: { release: () => void } | null = null;
  private held: Promise<void> | null = null;

  /** 다음 rasterize를 release()까지 붙잡아 둔다(진행 중 상태 검증). */
  hold(): void {
    this.held = new Promise<void>((resolve) => {
      this.gate = { release: resolve };
    });
  }
  release(): void {
    this.gate?.release();
    this.gate = null;
    this.held = null;
  }

  get calls(): number {
    return this.drawings.length;
  }

  async rasterize(drawing: SignatureDrawing): Promise<Blob> {
    this.drawings.push(drawing);
    if (this.held) await this.held;
    if (this.fail) throw this.fail;
    const png = fakePng(this.size);
    this.results.push(png);
    return png;
  }
}
