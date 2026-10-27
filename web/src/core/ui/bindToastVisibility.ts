import type { ToastController } from './ToastController';

export interface VisibilitySource {
  readonly visibilityState: 'visible' | 'hidden' | string;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/** 문서가 보일 때만 토스트를 받게 한다(D-20, TC-NAV-028). 지금 상태를 바로 반영하고 visibilitychange마다 toast.setVisible. 해제 함수를 돌려준다. */
export function bindToastVisibility(toast: ToastController, source: VisibilitySource): () => void {
  const apply = () => toast.setVisible(source.visibilityState !== 'hidden');
  apply();
  source.addEventListener('visibilitychange', apply);
  return () => source.removeEventListener('visibilitychange', apply);
}
