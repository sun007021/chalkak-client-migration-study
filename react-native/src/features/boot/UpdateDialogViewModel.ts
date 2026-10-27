import { Observable } from '../../core/state/Observable';
import type { StoreOpener } from './UpdateChecker';

export type UpdateDialogState = { opening: boolean };

export class UpdateDialogViewModel extends Observable<UpdateDialogState> {
  constructor(private readonly storeOpener: StoreOpener) {
    super({ opening: false });
  }

  /** 스토어 열기를 호출한다. 진행 중 연타는 무시하고, 실패해도 다이얼로그는 그대로 남으며 다시 누를 수 있다. */
  async onUpdatePress(): Promise<void> {
    if (this.getSnapshot().opening) return;
    this.setState({ opening: true });
    try {
      await this.storeOpener.open();
    } catch {
      // 스토어를 못 열어도 다이얼로그는 남고 다시 누를 수 있다.
    } finally {
      this.setState({ opening: false });
    }
  }
}
