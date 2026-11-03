import type { AppInfo } from '../../core/config/AppInfo';
import { Observable } from '../../core/state/Observable';
import type { AppExiter } from './AppExiter';
import type { StoreOpener } from './UpdateChecker';

export type UpdateDialogState = { opening: boolean };

export class UpdateDialogViewModel extends Observable<UpdateDialogState> {
  /** Android 계열만 "취소"(앱 종료) 버튼을 둔다. iOS 계열은 업데이트 버튼뿐이다(D-15). */
  readonly canCancel: boolean;

  constructor(
    private readonly storeOpener: StoreOpener,
    platform: AppInfo['platform'],
    private readonly appExiter: AppExiter,
  ) {
    super({ opening: false });
    this.canCancel = platform === 'android';
  }

  /**
   * 스토어 열기를 호출한다. 진행 중 연타는 무시한다. 열기에 실패하면 Android는 앱을 종료하고,
   * iOS는 다이얼로그가 그대로 남아 다시 누를 수 있다. 스토어에서 돌아와도 다이얼로그는 남는다.
   */
  async onUpdatePress(): Promise<void> {
    if (this.getSnapshot().opening) return;
    this.setState({ opening: true });
    try {
      await this.storeOpener.open();
    } catch {
      if (this.canCancel) this.appExiter.exit();
    } finally {
      this.setState({ opening: false });
    }
  }

  /** "취소"(Android 계열): 앱을 종료한다. 취소 버튼이 없는 플랫폼에서는 무시한다. */
  onCancelPress(): void {
    if (this.canCancel) this.appExiter.exit();
  }
}
