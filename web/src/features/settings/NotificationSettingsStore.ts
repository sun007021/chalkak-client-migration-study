import type { Ticket } from '../../core/state/StaleGuard';
import type { UserCache } from '../../core/auth/UserCaches';
import { t } from '../../copy/ko';
import { ApiError, isAbandoned } from '../../core/net/errors';
import { RequestSlots } from '../../core/state/RequestSlots';
import { StaleGuard } from '../../core/state/StaleGuard';
import { ViewModel } from '../../core/state/ViewModel';
import type { ToastController } from '../../core/ui/ToastController';
import type { NotificationSettings, NotificationSettingsRepository, PushSettingKey } from './NotificationSettingsRepository';

export interface NotificationSettingsState {
  /** idle: 조회 전·비움. loading: 조회 중(스위치 비활성). ready: 서버 값 반영. error: 조회 실패(스위치 비활성, values null). */
  status: 'idle' | 'loading' | 'ready' | 'error';
  values: NotificationSettings | null;
  /** 항목별 저장 중 여부. 같은 항목의 추가 입력은 무시하고 다른 항목은 독립이다(REQ-SET-014). */
  saving: Readonly<Record<PushSettingKey, boolean>>;
}

const NOT_SAVING = { topicPushEnabled: false, moderationPushEnabled: false, aiReviewPushEnabled: false } as const;

/**
 * 푸시 수신 설정 저장소(REQ-SET-008~014, 020). 컨테이너가 하나 들고 UserCaches에 등록한다.
 * load: 진행 중이면 같은 약속을 돌려준다. 실패하면 values를 비우고(오래된 값으로 바꾸지 않는다) 토스트 settings.push.load-error.
 * toggle: ready이고 그 항목이 저장 중이 아닐 때만. 즉시 반대 값으로 보이고 PATCH 한 항목만 보낸다. 실패하면 그 항목만 되돌리고 토스트 settings.push.save-error(401은 토스트 없음). 성공해도 서버 값으로 다시 덮어쓰지 않는다.
 * cancelPending: 진행 중 저장을 취소하고 그 항목을 이전 값으로 되돌린다(토스트 없음). clear: 계정 전환·로그아웃. 진행 중 응답을 무효화하고 idle로.
 */
export class NotificationSettingsStore extends ViewModel<NotificationSettingsState> implements UserCache {
  private readonly loadGuard = new StaleGuard();
  private readonly saves = new RequestSlots<PushSettingKey>();
  private inflight: Promise<void> | null = null;
  /** 저장 중인 항목의 낙관적 변경 이전 값. */
  private readonly previous = new Map<PushSettingKey, boolean>();

  constructor(private readonly deps: { repository: NotificationSettingsRepository; toast: ToastController }) {
    super({ status: 'idle', values: null, saving: NOT_SAVING });
  }

  load(): Promise<void> {
    if (this.inflight) return this.inflight;
    const ticket = this.loadGuard.begin();
    this.setState({ status: 'loading' });
    const run = this.runLoad(ticket).finally(() => {
      if (this.inflight === run) this.inflight = null;
    });
    this.inflight = run;
    return run;
  }

  private async runLoad(ticket: Ticket): Promise<void> {
    try {
      const values = await this.deps.repository.fetch();
      if (!ticket.isCurrent()) return;
      this.setState({ status: 'ready', values });
    } catch (error) {
      if (!ticket.isCurrent()) return;
      this.setState({ status: 'error', values: null });
      if (!isAbandoned(error) && !isUnauthorized(error)) this.deps.toast.show(t('settings.push.load-error'));
    }
  }

  async toggle(key: PushSettingKey): Promise<void> {
    const { status, values, saving } = this.state;
    if (status !== 'ready' || values === null || saving[key]) return;
    const before = values[key];
    const next = !before;
    const pass = this.saves.begin(key);
    this.previous.set(key, before);
    this.setState({ values: { ...values, [key]: next }, saving: { ...saving, [key]: true } });
    try {
      await this.deps.repository.update({ [key]: next }, pass.signal);
      if (!pass.isCurrent()) return;
      this.previous.delete(key);
      this.setState({ saving: { ...this.state.saving, [key]: false } });
    } catch (error) {
      if (!pass.isCurrent()) return;
      this.restore(key);
      if (!isAbandoned(error) && !isUnauthorized(error)) this.deps.toast.show(t('settings.push.save-error'));
    }
  }

  cancelPending(): void {
    for (const key of [...this.previous.keys()]) this.restore(key);
    this.saves.cancelAll();
  }

  clear(): void {
    this.loadGuard.invalidate();
    this.saves.cancelAll();
    this.inflight = null;
    this.previous.clear();
    this.setState({ status: 'idle', values: null, saving: NOT_SAVING });
  }

  /** 그 항목만 이전 값으로 되돌리고 저장 중 표시를 끈다. */
  private restore(key: PushSettingKey): void {
    const before = this.previous.get(key);
    this.previous.delete(key);
    const { values, saving } = this.state;
    this.setState({ values: values && before !== undefined ? { ...values, [key]: before } : values, saving: { ...saving, [key]: false } });
  }
}

const isUnauthorized = (error: unknown): boolean => error instanceof ApiError && error.status === 401;
