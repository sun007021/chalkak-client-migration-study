import type { SignatureDrawing } from './SignaturePad';

/** 사인을 PNG(image/png) Blob으로 내보낸다. 규격은 SIGNATURE_PNG_SIZE(1024×512, 패딩 48, 획 14, 투명 배경 + 흰 획). 1 MiB 검사는 호출한 쪽이 한다. */
export interface SignatureRasterizer {
  rasterize(drawing: SignatureDrawing): Promise<Blob>;
}

/** Canvas 2D 컨텍스트의 부분집합. 단위 테스트는 호출 기록용 Fake를 쓴다. */
export interface DrawSurface {
  readonly width: number;
  readonly height: number;
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'round' | 'bevel' | 'miter';
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  fill(): void;
  stroke(): void;
  /** 지금까지 그린 것을 PNG Blob으로. 배경은 투명. */
  toPng(): Promise<Blob>;
}

export interface CanvasSignatureRasterizerDeps {
  /** 정확히 width×height 픽셀의 투명한 표면. 기본 구현은 canvas 요소(구현 단계). */
  createSurface(width: number, height: number): DrawSurface;
}

/**
 * buildSignatureCommands의 결과를 표면에 그린다. 표면은 1024×512, 배경은 칠하지 않고(투명), 획과 점은 흰색(#ffffff),
 * lineWidth 14, lineCap·lineJoin 'round'. dot은 arc + fill, stroke는 beginPath → move/line/quad → stroke. 반환은 surface.toPng().
 */
export class CanvasSignatureRasterizer implements SignatureRasterizer {
  constructor(_deps: CanvasSignatureRasterizerDeps) {}

  rasterize(_drawing: SignatureDrawing): Promise<Blob> {
    throw new Error('not implemented');
  }
}
