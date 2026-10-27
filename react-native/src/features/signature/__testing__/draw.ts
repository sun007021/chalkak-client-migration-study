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

/** 비동기 연쇄(await 사이의 마이크로태스크)를 모두 흘려보낸다. */
export const flush = async (): Promise<void> => {
  for (let i = 0; i < 100; i += 1) await Promise.resolve();
};
