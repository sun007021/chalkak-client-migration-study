import type { CropRegion, PhotoEdit } from '../editModel';
import type { DecodedImage } from '../imagePorts';
import type { Size } from '../imageSizing';
import type { AdjustmentValues } from './adjustments';
import type { GeometryPlan } from './cropGeometry';

/** 미리보기·썸네일 한 장. src는 <img>가 쓰는 URL(blob URL 등). 쓴 쪽이 release()로 놓는다(URL revoke). */
export interface PreviewFrame {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  release(): void;
}

/**
 * 편집 미리보기 렌더(REQ-EDIT-007: 긴 변 maxLongEdge 이내로 줄여서). 실제 구현은 canvas, jsdom에서는 FakePreviewRenderer.
 * 편집값은 기하(회전 → 자르기) → 조정 → 필터 순서로 적용한다. signal이 abort되면 AbortError로 거절한다. 입력 image는 release하지 않는다.
 */
export interface PreviewRenderer {
  render(image: DecodedImage, edit: PhotoEdit, options: { maxLongEdge: number }, signal: AbortSignal): Promise<PreviewFrame>;
  /** 이 image에 대해 렌더러가 따로 들고 있는 것(예: 줄여 둔 프록시)을 놓는다. 편집기가 image를 release하기 전에 부른다. */
  forget?(image: DecodedImage): void;
}

/**
 * 렌더 요청을 한 프레임으로 모으는 수단. 실제 구현은 requestAnimationFrame, 테스트는 FakeRenderScheduler.
 * schedule은 callback을 다음 프레임에 한 번 실행하도록 예약하고 취소 함수를 돌려준다.
 */
export interface RenderScheduler {
  schedule(callback: () => void): () => void;
}

/** 자동 보정 분석 영역: 돌려서 자른 부분. */
export interface AutoAnalysisRegion {
  quarterTurns: PhotoEdit['quarterTurns'];
  crop: CropRegion;
}

/**
 * 자른 영역을 긴 변 longEdge로 줄여 분석한 자동 보정값. 분석할 수 없으면 null(REQ-EDIT-027).
 * 실제 구현은 canvas로 표본 픽셀을 읽어 computeAutoValues를 부른다.
 */
export interface AutoAnalyzer {
  analyze(image: DecodedImage, region: AutoAnalysisRegion, longEdge: number, signal: AbortSignal): Promise<AdjustmentValues | null>;
}

/** 편집 결과 한 장을 그리는 픽셀 표면(canvas 얇은 껍데기). jsdom 테스트는 FakePixelSurface. */
export interface PixelSurface {
  readonly width: number;
  readonly height: number;
  /** image를 plan.quarterTurns만큼 돌린 뒤 plan.rotatedRect를 잘라 표면 전체(plan.output)에 그린다. */
  drawGeometry(image: DecodedImage, plan: GeometryPlan): void;
  /** 표면의 RGBA 픽셀(복사본이 아니어도 된다 — writePixels로 되돌려 쓴다). */
  readPixels(): Uint8ClampedArray;
  writePixels(pixels: Uint8ClampedArray): void;
  /** 지금 표면을 새 DecodedImage로 만든다. release()가 표면을 놓는다. */
  toImage(): DecodedImage;
}

export type PixelSurfaceFactory = (size: Size) => PixelSurface;
