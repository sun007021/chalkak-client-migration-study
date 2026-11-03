// Playwright 테스트 전용 번들 진입점: 앱 번들(dist)에는 들어가지 않는다. photo-edit.spec.ts가 vite로 따로 묶어 페이지에 주입한다.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { ObjectUrlFactory } from '../../src/features/signature/BlobUrlFactory';
import { BrowserImageDecoder } from '../../src/features/upload/browserImage';
import type { PhotoEdit } from '../../src/features/upload/editModel';
import { computeAutoValues } from '../../src/features/upload/editor/autoAdjust';
import type { AdjustmentValues } from '../../src/features/upload/editor/adjustments';
import { CanvasAutoAnalyzer, CanvasPreviewRenderer } from '../../src/features/upload/editor/canvasPorts';
import { CanvasEditRenderer, createCanvasPixelSurface } from '../../src/features/upload/editor/CanvasEditRenderer';
import { applyColorPipeline, colorParamsOf } from '../../src/features/upload/editor/colorPipeline';
import { planGeometry } from '../../src/features/upload/editor/cropGeometry';
import { createPhotoEditor } from '../../src/features/upload/editor/PhotoEditorScreen';
import { isDrawableImage } from '../../src/features/upload/imagePorts';
import type { DecodedImage } from '../../src/features/upload/imagePorts';

interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const decode = (source: Blob, signal: AbortSignal = new AbortController().signal) => new BrowserImageDecoder().decode(source, { maxLongEdge: 4096 }, signal);

/** 디코드한 이미지(또는 표면 결과)의 RGBA 픽셀. */
function pixelsOf(image: DecodedImage): Pixels {
  if (!isDrawableImage(image)) throw new Error('image is not drawable');
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image.drawable, 0, 0);
  return { width: image.width, height: image.height, data: context.getImageData(0, 0, image.width, image.height).data };
}

/** 기대값용 기하 연산: canvas 없이 픽셀 배열로 90도 회전하고 자른다(canvas 변환과 별개로 쓴 단순 구현). */
function referenceGeometry(source: Pixels, edit: PhotoEdit): Pixels {
  const { width: w, height: h } = source;
  const turns = edit.quarterTurns;
  const rotatedWidth = turns % 2 === 1 ? h : w;
  const rotatedHeight = turns % 2 === 1 ? w : h;
  const rotated = new Uint8ClampedArray(rotatedWidth * rotatedHeight * 4);
  for (let yr = 0; yr < rotatedHeight; yr += 1) {
    for (let xr = 0; xr < rotatedWidth; xr += 1) {
      // 돌린 사진의 픽셀 (xr, yr)이 가리키는 원본 픽셀(시계 방향 회전).
      const [x, y] = turns === 0 ? [xr, yr] : turns === 1 ? [yr, h - 1 - xr] : turns === 2 ? [w - 1 - xr, h - 1 - yr] : [w - 1 - yr, xr];
      const from = (y * w + x) * 4;
      rotated.set(source.data.subarray(from, from + 4), (yr * rotatedWidth + xr) * 4);
    }
  }
  const plan = planGeometry({ width: w, height: h }, edit);
  const { x, y, width, height } = plan.rotatedRect;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const from = ((y + row) * rotatedWidth + x) * 4;
    out.set(rotated.subarray(from, from + width * 4), row * width * 4);
  }
  return { width, height, data: out };
}

export interface CompareReport {
  width: number;
  height: number;
  expectedWidth: number;
  expectedHeight: number;
  maxDiff: number;
  /** 허용 오차를 넘은 값의 수가 아니라 달라진 값의 총수(진단용). */
  changedValues: number;
  /** 편집이 실제로 픽셀을 바꿨는가(원본 기하 결과와 다른 값이 있는가). */
  differsFromGeometryOnly: boolean;
}

/** 실제 canvas로 편집(CanvasEditRenderer)한 결과를 순수 함수 기대값(기하 + applyColorPipeline)과 값 단위로 비교한다. */
export async function compareEdit(source: Blob, edit: PhotoEdit): Promise<CompareReport> {
  const controller = new AbortController();
  const image = await decode(source, controller.signal);
  try {
    const original = pixelsOf(image);
    const expected = referenceGeometry(original, edit);
    const geometryOnly = Uint8ClampedArray.from(expected.data);
    applyColorPipeline(expected.data, colorParamsOf(edit));
    const output = await new CanvasEditRenderer({ createSurface: createCanvasPixelSurface }).render(image, edit, controller.signal);
    try {
      const actual = pixelsOf(output);
      let maxDiff = 0;
      let changedValues = 0;
      let differsFromGeometryOnly = false;
      const comparable = actual.data.length === expected.data.length;
      if (comparable) {
        for (let i = 0; i < actual.data.length; i += 1) {
          const diff = Math.abs(actual.data[i]! - expected.data[i]!);
          if (diff > 0) changedValues += 1;
          if (diff > maxDiff) maxDiff = diff;
          if (actual.data[i] !== geometryOnly[i]) differsFromGeometryOnly = true;
        }
      }
      return { width: actual.width, height: actual.height, expectedWidth: expected.width, expectedHeight: expected.height, maxDiff: comparable ? maxDiff : 255, changedValues, differsFromGeometryOnly };
    } finally {
      output.release();
    }
  } finally {
    image.release();
  }
}

export interface PreviewReport {
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  src: string;
  center: [number, number, number];
  revoked: boolean;
}

/** 미리보기 렌더(CanvasPreviewRenderer): 크기, 실제로 <img>가 읽히는지, 가운데 픽셀 색. */
export async function renderPreview(source: Blob, edit: PhotoEdit, maxLongEdge: number): Promise<PreviewReport> {
  const controller = new AbortController();
  const image = await decode(source, controller.signal);
  const urls = new ObjectUrlFactory();
  const frame = await new CanvasPreviewRenderer({ createSurface: createCanvasPixelSurface, blobUrls: urls }).render(image, edit, { maxLongEdge }, controller.signal);
  try {
    const element = new Image();
    element.src = frame.src;
    await element.decode();
    const canvas = document.createElement('canvas');
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(element, 0, 0);
    const [r, g, b] = context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
    const src = frame.src;
    frame.release();
    const revoked = await fetch(src).then(
      () => false,
      () => true,
    );
    return { width: frame.width, height: frame.height, naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight, src, center: [r!, g!, b!], revoked };
  } finally {
    frame.release();
    image.release();
  }
}

export interface AnalyzeReport {
  actual: AdjustmentValues | null;
  expected: AdjustmentValues;
}

/** 자동 보정 분석기(CanvasAutoAnalyzer)의 결과를, 같은 영역 픽셀에 computeAutoValues를 부른 기대값과 비교한다(소스가 256 이하라 다시 그리지 않는다). */
export async function analyze(source: Blob, edit: Pick<PhotoEdit, 'quarterTurns' | 'crop'>): Promise<AnalyzeReport> {
  const controller = new AbortController();
  const image = await decode(source, controller.signal);
  try {
    const expected = computeAutoValues(referenceGeometry(pixelsOf(image), { quarterTurns: edit.quarterTurns, crop: edit.crop } as PhotoEdit).data);
    const actual = await new CanvasAutoAnalyzer({ createSurface: createCanvasPixelSurface }).analyze(image, edit, 256, controller.signal);
    return { actual, expected };
  } finally {
    image.release();
  }
}

let mounted: { root: Root; host: HTMLElement } | null = null;

/** 실제 편집기 화면을 페이지에 올린다(실제 디코더·canvas 미리보기·분석기). 결과는 window.__editorEvents에 쌓인다. */
export function mountEditor(source: Blob, initialEdit: PhotoEdit): void {
  unmountEditor();
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:9999;background:Canvas;overflow:auto';
  document.body.appendChild(host);
  const events: { type: 'confirm' | 'cancel'; edit?: PhotoEdit }[] = [];
  (window as unknown as { __editorEvents: typeof events }).__editorEvents = events;
  const pixelSurface = createCanvasPixelSurface;
  const Editor = createPhotoEditor({
    decoder: new BrowserImageDecoder(),
    preview: new CanvasPreviewRenderer({ createSurface: pixelSurface, blobUrls: new ObjectUrlFactory() }),
    analyzer: new CanvasAutoAnalyzer({ createSurface: pixelSurface }),
  });
  const root = createRoot(host);
  root.render(createElement(Editor, { source, initialEdit, onConfirm: (edit: PhotoEdit) => events.push({ type: 'confirm', edit }), onCancel: () => events.push({ type: 'cancel' }) }));
  mounted = { root, host };
}

export function unmountEditor(): void {
  mounted?.root.unmount();
  mounted?.host.remove();
  mounted = null;
}
