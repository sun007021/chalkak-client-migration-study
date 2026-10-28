export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export function clampZoomScale(s: number): number { return Number.isFinite(s) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s)) : MIN_ZOOM; }
export function pinchScale(a: number, b: number, c: number): number { return b <= 0 ? a : clampZoomScale(a * (c / b)); }
export function clampPan(t: Point, s: number, size: Size): Point {
  const mx = ((s - 1) * size.width) / 2, my = ((s - 1) * size.height) / 2;
  const f = (v: number, m: number) => { const r = Math.min(m, Math.max(-m, v)); return r === 0 ? 0 : r; };
  return { x: f(t.x, mx), y: f(t.y, my) };
}
export function zoomAroundPoint(a: { focal: Point; translate: Point; fromScale: number; toScale: number; size: Size }): Point {
  const to = clampZoomScale(a.toScale);
  const r = to / a.fromScale;
  return clampPan({ x: a.focal.x - (a.focal.x - a.translate.x) * r, y: a.focal.y - (a.focal.y - a.translate.y) * r }, to, a.size);
}
export function releaseZoom() { return { scale: 1, translate: { x: 0, y: 0 } }; }
