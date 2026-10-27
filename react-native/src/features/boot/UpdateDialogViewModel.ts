import { Observable } from '../../core/state/Observable';
import type { StoreOpener } from './UpdateChecker';

export type UpdateDialogState = { opening: boolean };

export class UpdateDialogViewModel extends Observable<UpdateDialogState> {
  constructor(private readonly storeOpener: StoreOpener) {
    super({ opening: false });
  }

  /** 스토어 열기를 호출한다. 진행 중 연타는 무시하고, 실패해도 다이얼로그는 그대로 남으며 다시 누를 수 있다. */
  onUpdatePress(): Promise<void> {
    void this.storeOpener;
    throw new Error('not implemented');
  }
}
