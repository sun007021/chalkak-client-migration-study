import type { PhotoEdit } from '../editModel';
import type { DecodedImage } from '../imagePorts';
import type { AdjustmentValues } from './adjustments';
import type { AutoAnalysisRegion, AutoAnalyzer, PixelSurfaceFactory, PreviewFrame, PreviewRenderer } from './editorPorts';

/** 실제 미리보기 렌더(구현 단계, canvas → blob URL). PixelSurface 위에서 CanvasEditRenderer와 같은 연산을 쓴다. jsdom에서 테스트하지 않는다. */
export class CanvasPreviewRenderer implements PreviewRenderer {
  constructor(protected readonly deps: { createSurface: PixelSurfaceFactory }) {}
  render(_image: DecodedImage, _edit: PhotoEdit, _options: { maxLongEdge: number }, _signal: AbortSignal): Promise<PreviewFrame> {
    throw new Error('not implemented');
  }
}

/** 실제 자동 보정 분석기(구현 단계). 표본 픽셀을 읽어 computeAutoValues를 부른다. jsdom에서 테스트하지 않는다. */
export class CanvasAutoAnalyzer implements AutoAnalyzer {
  constructor(protected readonly deps: { createSurface: PixelSurfaceFactory }) {}
  analyze(_image: DecodedImage, _region: AutoAnalysisRegion, _longEdge: number, _signal: AbortSignal): Promise<AdjustmentValues | null> {
    throw new Error('not implemented');
  }
}
