export type Surface = OffscreenCanvas | HTMLCanvasElement;

export function createSurface(width: number, height: number): Surface {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** 큰 canvas 메모리를 바로 돌려준다. */
export function releaseSurface(surface: Surface): void {
  surface.width = 0;
  surface.height = 0;
}
