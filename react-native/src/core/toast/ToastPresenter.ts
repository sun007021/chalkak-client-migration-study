/** 토스트 표시 인터페이스(D-20). 같은 문구가 연달아 와도 매번 다시 보여 준다. */
export interface ToastPresenter {
  show(message: string): void;
}
