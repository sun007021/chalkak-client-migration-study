import { ViewModel } from '../state/ViewModel';
import type { Clock } from '../time/Clock';
import type { IdGenerator } from '../ids';

export interface Toast {
  /** 메시지마다 고유. 같은 문구가 연달아 나와도 다르다. */
  id: string;
  message: string;
}

export interface ToastState {
  toast: Toast | null;
}

/** 토스트 하나를 TOAST_DURATION_MS(2.5초) 동안 보인다. 화면이 보일 때만 받는다(보이지 않을 땐 버림). */
export class ToastController extends ViewModel<ToastState> {
  constructor(_deps: { clock: Clock; ids: IdGenerator }) {
    super({ toast: null });
  }
  show(_message: string): void {
    throw new Error('not implemented');
  }
  /** 앱/화면이 보이는지. false가 되면 떠 있는 토스트도 지운다. 기본 true. */
  setVisible(_visible: boolean): void {
    throw new Error('not implemented');
  }
}
