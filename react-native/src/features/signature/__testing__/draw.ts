import type { SignatureDrawViewModel } from '../SignatureDrawViewModel';
import type { Point, Size } from '../Stroke';

export const CANVAS: Size = { width: 300, height: 150 };

export function drawStroke(vm: SignatureDrawViewModel, points: readonly Point[]): void {
  const [first, ...rest] = points;
  vm.beginStroke(first);
  rest.forEach((p) => vm.appendPoint(p));
  vm.endStroke();
}

export const drawDot = (vm: SignatureDrawViewModel, x = 100, y = 70): void =>
  drawStroke(vm, [{ x, y }]);

export const drawLine = (vm: SignatureDrawViewModel): void =>
  drawStroke(vm, [
    { x: 40, y: 40 },
    { x: 120, y: 90 },
    { x: 220, y: 60 },
  ]);

/** 대기 중인 마이크로태스크 연쇄를 모두 흘려보낸다: 다음 매크로태스크(setImmediate)까지 기다리므로 연쇄 길이에 의존하지 않는다. */
export const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
