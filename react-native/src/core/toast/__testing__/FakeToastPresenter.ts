import type { ToastPresenter } from '../ToastPresenter';

export class FakeToastPresenter implements ToastPresenter {
  readonly messages: string[] = [];

  show(message: string): void {
    this.messages.push(message);
  }
}
