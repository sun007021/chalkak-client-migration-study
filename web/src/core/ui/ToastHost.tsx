import type { ReactNode } from 'react';
import type { ToastController } from './ToastController';

/** data-testid: 토스트가 있는 동안만 `toast.container`(안에 `toast.message`). 없으면 DOM에서 뺀다. */
export function ToastHost(_props: { controller: ToastController }): ReactNode {
  throw new Error('not implemented');
}
