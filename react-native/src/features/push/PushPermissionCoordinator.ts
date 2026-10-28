import type { PushPermissionGateway } from '../../core/push/PushPermissionGateway';
import type { PushPromptFlagStore } from '../../core/push/PushPromptFlagStore';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import { t } from '../../shared/copy';
import type { BootState } from '../boot/BootViewModel';

export type PushPermissionCoordinatorDeps = {
  boot: { getSnapshot(): Readonly<BootState>; subscribe(listener: () => void): () => void };
  gateway: PushPermissionGateway;
  flags: PushPromptFlagStore;
  toast: ToastPresenter;
};

/**
 * 인증 사용자가 메인에 처음 들어온 직후 OS 권한을 한 번만 요청한다(REQ-PUSH-001~006).
 * 게스트·로그인·가입 단계에서는 요청하지 않는다. 결과(허용·거부)로 서버 수신 설정을 바꾸지 않는다.
 */
export class PushPermissionCoordinator {
  /** 이 프로세스에서 이미 판단했다(저장된 표시와 별개로 같은 프로세스의 재진입을 막는다). */
  private handled = false;

  constructor(private readonly deps: PushPermissionCoordinatorDeps) {}

  start(): () => void {
    const stop = this.deps.boot.subscribe(() => this.check());
    this.check();
    return stop;
  }

  private check(): void {
    const { phase, mode } = this.deps.boot.getSnapshot();
    if (phase !== 'main' || mode !== 'member' || this.handled) return;
    this.handled = true;
    void this.run();
  }

  private async run(): Promise<void> {
    const { flags, gateway, toast } = this.deps;
    try {
      if (await flags.wasRequested()) return;
      // 요청을 띄우는 시점에 표시를 남겨 실패해도 다시 묻지 않는다.
      await flags.markRequested();
      if ((await gateway.status()) !== 'undetermined') return;
      await gateway.request();
    } catch (error) {
      console.warn('[PushPermissionCoordinator] permission request failed', errorName(error));
      toast.show(t('noti.perm.error'));
    }
  }
}

const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'unknown');
