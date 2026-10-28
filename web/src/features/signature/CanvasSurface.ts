import type { DrawSurface } from './SignatureRasterizer';

/** 실제 구현: 정확히 width×height 픽셀 canvas 요소의 2D 컨텍스트를 DrawSurface로 감싼다. toPng는 canvas.toBlob('image/png'). 브라우저 E2E에서 검증한다. */
export function createCanvasSurface(width: number, height: number): DrawSurface {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas 2d context unavailable');
  return {
    width,
    height,
    get strokeStyle() {
      return String(context.strokeStyle);
    },
    set strokeStyle(value: string) {
      context.strokeStyle = value;
    },
    get fillStyle() {
      return String(context.fillStyle);
    },
    set fillStyle(value: string) {
      context.fillStyle = value;
    },
    get lineWidth() {
      return context.lineWidth;
    },
    set lineWidth(value: number) {
      context.lineWidth = value;
    },
    get lineCap() {
      return context.lineCap;
    },
    set lineCap(value) {
      context.lineCap = value;
    },
    get lineJoin() {
      return context.lineJoin as DrawSurface['lineJoin'];
    },
    set lineJoin(value) {
      context.lineJoin = value;
    },
    beginPath: () => context.beginPath(),
    moveTo: (x, y) => context.moveTo(x, y),
    lineTo: (x, y) => context.lineTo(x, y),
    quadraticCurveTo: (cx, cy, x, y) => context.quadraticCurveTo(cx, cy, x, y),
    arc: (x, y, radius, start, end) => context.arc(x, y, radius, start, end),
    fill: () => context.fill(),
    stroke: () => context.stroke(),
    toPng: () =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas toBlob failed'))), 'image/png');
      }),
  };
}
