import { clampPan, clampScale, panForFocalPoint, type Point, type Size } from './photoZoom';

export type Transform = { scale: number; pan: Point };

type Gesture = {
  distance: number;
  /** 시작 때 두 손가락의 중점(화면 좌표). 컨테이너 좌표는 origin이 정해진 뒤에 계산한다. */
  pageFocal: Point;
  base: Transform;
  moved: boolean;
};

type Touch = { pageX: number; pageY: number };

const midpoint = (a: Touch, b: Touch): Point => ({
  x: (a.pageX + b.pageX) / 2,
  y: (a.pageY + b.pageY) / 2,
});
const distance = (a: Touch, b: Touch): number => Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);

/**
 * 두 손가락 핀치의 계산. 화면(RN)과 분리해 둔 순수 상태 기계다.
 *
 * 터치 좌표는 화면 기준이라 컨테이너의 화면 위치(origin)가 필요한데, 그 값은 비동기로만 잴 수 있다.
 * 그래서 origin은 미리(레이아웃 때) 재 두고, 제스처가 시작된 뒤 늦게 도착한 값은 아직 아무것도 그리지 않았을 때만
 * 반영한다. 손가락 위치(pageFocal)는 화면 좌표로 보관하고 origin은 그릴 때마다 읽으므로, 늦게 도착해도 원점·초점이
 * 같은 값으로 맞춰져 첫 핀치가 튀지 않는다. 이미 그리기 시작한 제스처 중에 온 값은 다음 제스처로 미룬다.
 */
export class PinchTracker {
  private origin: Point = { x: 0, y: 0 };
  private pendingOrigin: Point | null = null;
  private container: Size = { width: 0, height: 0 };
  private gesture: Gesture | null = null;

  setContainer(size: Size): void {
    this.container = size;
  }

  /** 컨테이너의 화면 위치가 측정됐다. */
  originMeasured(origin: Point): void {
    if (this.gesture?.moved) this.pendingOrigin = origin;
    else this.origin = origin;
  }

  get active(): boolean {
    return this.gesture !== null;
  }

  /** `displayed`는 지금 화면에 보이는 변환(복귀 애니메이션 중이면 그 중간 값)이다. */
  start(a: Touch, b: Touch, displayed: Transform): void {
    this.gesture = {
      distance: distance(a, b),
      pageFocal: midpoint(a, b),
      base: displayed,
      moved: false,
    };
  }

  /** 새 변환. 제스처가 없거나 손가락이 겹쳐 계산할 수 없으면 null. */
  move(a: Touch, b: Touch): Transform | null {
    const start = this.gesture;
    if (!start || start.distance <= 0) return null;
    start.moved = true;
    const scale = clampScale((start.base.scale * distance(a, b)) / start.distance);
    const focal = {
      x: start.pageFocal.x - this.origin.x,
      y: start.pageFocal.y - this.origin.y,
    };
    const mid = midpoint(a, b);
    const moved = {
      x: mid.x - this.origin.x - focal.x,
      y: mid.y - this.origin.y - focal.y,
    };
    const anchored = panForFocalPoint(
      focal,
      start.base.scale,
      scale,
      start.base.pan,
      this.container,
    );
    return {
      scale,
      pan: clampPan({ x: anchored.x + moved.x, y: anchored.y + moved.y }, scale, this.container),
    };
  }

  /** 손을 뗐다. 미뤄 둔 origin을 반영한다. */
  end(): void {
    this.gesture = null;
    if (this.pendingOrigin) {
      this.origin = this.pendingOrigin;
      this.pendingOrigin = null;
    }
  }
}
