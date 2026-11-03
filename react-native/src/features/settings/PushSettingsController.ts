import { CancelledError } from '../../core/http/ApiError';
import type { PushPermissionGateway } from '../../core/push/PushPermissionGateway';
import { Observable } from '../../core/state/Observable';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import {
  PUSH_SETTING_KEYS,
  type NotificationSettings,
  type NotificationSettingsRepository,
  type PushSettingKey,
} from '../../data/settings/NotificationSettingsRepository';
import { t } from '../../shared/copy';
import type { AuthFlowNavigator } from '../auth/AuthFlowNavigator';
import { AuthErrorPolicy } from '../common/AuthErrorPolicy';

export type PushSettingsState = {
  /** loading/error에서는 스위치를 쓸 수 없다(값을 지어내지 않는다, REQ-SET-010). */
  status: 'loading' | 'ready' | 'error';
  values: NotificationSettings | null;
  /** 항목별 저장 중. 같은 항목의 추가 입력은 무시하고 다른 항목은 독립이다(REQ-SET-014). */
  saving: Readonly<Record<PushSettingKey, boolean>>;
};

export type PushSettingsControllerDeps = {
  settings: NotificationSettingsRepository;
  permission: PushPermissionGateway;
  toast: ToastPresenter;
  authFlow: Pick<AuthFlowNavigator, 'toLogin'>;
};

const NOT_SAVING: Readonly<Record<PushSettingKey, boolean>> = {
  topic: false,
  moderation: false,
  aiReview: false,
};

const INITIAL: PushSettingsState = { status: 'loading', values: null, saving: NOT_SAVING };

type InFlight = { token: number; controller: AbortController; previous: boolean };

type PermissionVerdict = 'allow' | 'open-settings' | 'deny';

/**
 * 푸시 설정 3종의 조회·토글. SettingsViewModel이 만들어 합성한다.
 *
 * 소유권 규칙(StrictMode·경합 안전):
 * - 요청마다 `nextId()`(카운터 하나)로 번호를 받는다. 조회 번호(`loadId`)와 토글 토큰이 같은 카운터에서 나오므로
 *   AuthErrorPolicy의 키가 서로 겹치지 않는다.
 * - 조회가 새로 시작되거나(재조회), 화면을 떠나거나(suspend), 초기화(reset)되면 진행 중인 토글을 **모두** 취소한다:
 *   요청을 abort하고 낙관적으로 바꾼 값을 되돌리고 saving을 푼다. 권한 창이 열려 있는 동안이라도 마찬가지라
 *   늦게 돌아온 권한 결과는 자기 토큰이 더는 현재가 아니므로 아무것도 하지 못한다(스위치가 잠기지 않는다).
 */
export class PushSettingsController extends Observable<PushSettingsState> {
  private readonly authErrors: AuthErrorPolicy;
  private seq = 0;
  private loadId = 0;
  private loadController: AbortController | null = null;
  private readonly inFlight = new Map<PushSettingKey, InFlight>();

  constructor(private readonly deps: PushSettingsControllerDeps) {
    super(INITIAL);
    this.authErrors = new AuthErrorPolicy(deps.authFlow);
  }

  async load(): Promise<void> {
    this.loadController?.abort();
    this.cancelToggles();
    const controller = new AbortController();
    this.loadController = controller;
    const id = this.nextId();
    this.loadId = id;
    this.patch({ status: 'loading' });
    try {
      const values = await this.deps.settings.get(controller.signal);
      if (id !== this.loadId) return;
      this.patch({ status: 'ready', values });
    } catch (error) {
      if (id !== this.loadId || error instanceof CancelledError) return;
      this.patch({ status: 'error', values: null });
      // 401은 정책/세션 이벤트가 로그인으로 보낸다. 그 밖에는 토스트(REQ-SET-010).
      if (!this.authErrors.handle(error, id)) {
        this.deps.toast.show(t('settings.push.load-error'));
      }
    }
  }

  /**
   * 스위치를 눌렀다. 켜려는데 기기 권한이 꺼져 있으면 서버 값을 바꾸지 않고 시스템 설정으로 보낸다(REQ-SET-015).
   * 미결정이면 권한을 요청하고 허용될 때만 저장한다(REQ-SET-018). 끄는 것은 권한과 무관하다(REQ-SET-016).
   */
  async toggle(key: PushSettingKey): Promise<void> {
    const { status, values, saving } = this.getSnapshot();
    if (status !== 'ready' || values === null) return;
    if (!PUSH_SETTING_KEYS.includes(key) || this.inFlight.has(key)) return;
    const previous = values[key];
    const target = !previous;
    const token = this.nextId();
    const controller = new AbortController();
    this.inFlight.set(key, { token, controller, previous });
    this.patch({ saving: { ...saving, [key]: true } });
    const isCurrent = () => this.inFlight.get(key)?.token === token;

    if (target) {
      const verdict = await this.checkPermission();
      if (!isCurrent()) return;
      if (verdict !== 'allow') {
        this.inFlight.delete(key);
        this.setSaving(key, false);
        if (verdict === 'open-settings')
          await this.deps.permission.openSystemSettings().catch(() => undefined);
        return;
      }
    }

    this.setValue(key, target);
    try {
      await this.deps.settings.update(key, target, controller.signal);
    } catch (error) {
      if (!isCurrent()) return;
      this.inFlight.delete(key);
      this.setValue(key, previous);
      this.setSaving(key, false);
      if (error instanceof CancelledError || this.authErrors.handle(error, token)) return;
      this.deps.toast.show(t('settings.push.save-error'));
      return;
    }
    if (!isCurrent()) return;
    this.inFlight.delete(key);
    this.setSaving(key, false);
  }

  /**
   * 화면을 떠난다: 조회를 취소하고 저장 중인 항목을 조용히 되돌린다(TC-SET-030).
   * 되돌리는 이유: 응답을 기다리지 않고 떠났으므로 서버에 반영됐는지 알 수 없다. 낙관적 값을 남기면 거짓 상태가 될 수 있어
   * 이전 값으로 돌리고, 다음 진입의 조회(onShown -> load)가 서버 값으로 바로잡는다(self-heal).
   */
  suspend(): void {
    this.loadController?.abort();
    this.loadController = null;
    this.loadId = this.nextId();
    this.cancelToggles();
  }

  /** 로그아웃·계정 전환: 진행 중인 것을 모두 버리고 이전 계정의 값을 지운다. */
  reset(): void {
    this.suspend();
    this.setState(INITIAL);
  }

  private nextId(): number {
    this.seq += 1;
    return this.seq;
  }

  private cancelToggles(): void {
    if (this.inFlight.size === 0) return;
    const { values } = this.getSnapshot();
    const reverted = values === null ? null : { ...values };
    for (const [key, entry] of this.inFlight) {
      entry.controller.abort();
      if (reverted !== null) reverted[key] = entry.previous;
    }
    this.inFlight.clear();
    this.patch({ values: reverted, saving: NOT_SAVING });
  }

  /**
   * 켜기 전 기기 권한 확인.
   * - granted: 허용.
   * - undetermined: 시스템 권한 창을 띄우고 허용될 때만 허용. 거부해도 설정 앱으로 보내지 않는다(방금 거절한 사용자).
   * - 이미 denied였던 경우에만 시스템 설정을 연다.
   * - 확인 자체가 실패하면 막지 않고 서버 저장으로 진행한다(fail-open): 권한 API 오류가 설정 저장을 막지 않게 한다.
   */
  private async checkPermission(): Promise<PermissionVerdict> {
    const { permission } = this.deps;
    try {
      const before = await permission.status();
      const now = before === 'undetermined' ? await permission.request() : before;
      if (now === 'granted') return 'allow';
      return before === 'denied' ? 'open-settings' : 'deny';
    } catch {
      return 'allow';
    }
  }

  private patch(patch: Partial<PushSettingsState>): void {
    this.setState({ ...this.getSnapshot(), ...patch });
  }

  private setValue(key: PushSettingKey, value: boolean): void {
    const { values } = this.getSnapshot();
    if (values !== null) this.patch({ values: { ...values, [key]: value } });
  }

  private setSaving(key: PushSettingKey, saving: boolean): void {
    this.patch({ saving: { ...this.getSnapshot().saving, [key]: saving } });
  }
}
