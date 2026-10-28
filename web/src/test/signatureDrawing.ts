import { fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import type { PadPoint } from '../features/signature/SignaturePad';

/** 점들을 포인터로 한 획 그린다. 캔버스의 CSS 상자를 (0,0)~(rect.width, rect.height)로 고정하므로 clientX = 패드 x / (1024 / rect.width). */
export function stubCanvasRect(canvas: Element, rect = { width: 512, height: 256 }): void {
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: rect.width, bottom: rect.height, x: 0, y: 0, width: rect.width, height: rect.height, toJSON: () => ({}) });
}

/** 패드 좌표(1024×512) 점들을 이어서 한 획으로 그린다. stubCanvasRect(512×256)를 전제로 클라이언트 좌표는 절반. */
export function drawStroke(canvas: Element, points: readonly PadPoint[], pointerId = 1): void {
  const [first, ...rest] = points;
  if (!first) return;
  fireEvent.pointerDown(canvas, { clientX: first.x / 2, clientY: first.y / 2, pointerId, buttons: 1, isPrimary: true });
  for (const p of rest) fireEvent.pointerMove(canvas, { clientX: p.x / 2, clientY: p.y / 2, pointerId, buttons: 1, isPrimary: true });
  const last = points[points.length - 1]!;
  fireEvent.pointerUp(canvas, { clientX: last.x / 2, clientY: last.y / 2, pointerId, buttons: 0, isPrimary: true });
}
