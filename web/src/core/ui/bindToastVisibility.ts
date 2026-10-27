import type { ToastController } from './ToastController';

export interface VisibilitySource {
  readonly visibilityState: 'visible' | 'hidden' | string;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/** 문서가 보일 때만 토스트를 받게 한다(D-20, TC-NAV-028). 지금 상태를 바로 반영하고 visibilitychange마다 toast.setVisible. 해제 함수를 돌려준다. */
export function bindToastVisibility(_toast: ToastController, _source: VisibilitySource): () => void {
  throw new Error('not implemented');
}
