import type { AnalyticsTracker } from '../../core/analytics/AnalyticsTracker';
import { CancelledError } from '../../core/http/ApiError';
import type { AppVisibility } from '../../core/lifecycle/AppVisibility';
import type { ExternalLinkOpener } from '../../core/linking/ExternalLinkOpener';
import type { AppVersionProvider } from '../../core/config/AppVersionProvider';
import type {
  PushPermissionGateway,
  PushPermissionStatus,
} from '../../core/push/PushPermissionGateway';
import type { UserDataCache } from '../../core/push/UserDataCache';
import { Observable } from '../../core/state/Observable';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import {
  PUSH_SETTING_KEYS,
  type NotificationSettings,
  type NotificationSettingsRepository,
  type PushSettingKey,
} from '../../data/settings/NotificationSettingsRepository';
import { TERMS_URLS } from '../../shared/constants';
import { t } from '../../shared/copy';
import type { AccountActionsViewModel } from '../auth/AccountActionsViewModel';
import type { AuthFlowNavigator, MainMode } from '../auth/AuthFlowNavigator';
import { AuthErrorPolicy } from '../common/AuthErrorPolicy';
import { TermsDocumentViewModel } from '../onboarding/TermsDocumentViewModel';
import type { TermsKind } from '../onboarding/TermsViewModel';
import type { SignatureCardViewModel } from '../signature/SignatureCardViewModel';
import type { SettingsNavigator } from './SettingsNavigator';

export type PushSettingsState = {
  /** loading/error에서는 스위치를 쓸 수 없다(값을 지어내지 않는다, REQ-SET-010). */
  status: 'loading' | 'ready' | 'error';
  values: NotificationSettings | null;
  /** 항목별 저장 중. 같은 항목의 추가 입력은 무시하고 다른 항목은 독립이다(REQ-SET-014). */
  saving: Readonly<Record<PushSettingKey, boolean>>;
};

export type SettingsState = {
  mode: MainMode;
  version: string;
  push: PushSettingsState;
  /** 마지막으로 확인한 기기 알림 권한(스위치 값과 무관, REQ-SET-017). */
  devicePermission: PushPermissionStatus | null;
  dialog: 'none' | 'logout' | 'withdraw';
  openDocument: TermsKind | null;
};

export type SettingsViewModelDeps = {
  mode: MainMode;
  settings: NotificationSettingsRepository;
  signatureCard: SignatureCardViewModel;
  account: AccountActionsViewModel;
  permission: PushPermissionGateway;
  visibility: AppVisibility;
  appVersion: AppVersionProvider;
  analytics: AnalyticsTracker;
  linkOpener: ExternalLinkOpener;
  toast: ToastPresenter;
  navigator: SettingsNavigator;
  authFlow: Pick<AuthFlowNavigator, 'toLogin'>;
};

const NOT_SAVING: Readonly<Record<PushSettingKey, boolean>> = {
  topic: false,
  moderation: false,
  aiReview: false,
};

type InFlight = { token: number; controller: AbortController; previous: boolean };

/**
 * 설정 탭. 소유자(SettingsViewModelOwner)가 메인 단계 동안 만들고 버리며, 계정 전환 때 비우도록 UserDataCache를 구현한다.
 * 하위 ViewModel(사인 카드, 계정 동작)과 약관 문서 ViewModel은 여기서 버린다.
 *
 * - 푸시 설정: 낙관적 갱신, 항목별 저장 잠금, 실패한 항목만 되돌림. 조회·저장 응답은 세대 번호(계정 전환·이탈)로 거른다.
 * - 화면 이탈(onHidden)은 저장 중인 항목을 조용히 되돌린다(TC-SET-030).
 */
export class SettingsViewModel extends Observable<SettingsState> implements UserDataCache {
  private readonly authErrors: AuthErrorPolicy;
  private generation = 0;
  private loadController: AbortController | null = null;
  private readonly inFlight = new Map<PushSettingKey, InFlight>();
  private tokenSeq = 0;
  private stopVisibility: (() => void) | null = null;
  private documentViewModel: TermsDocumentViewModel | null = null;
  private confirming = false;
  private released = false;

  constructor(private readonly deps: SettingsViewModelDeps) {
    super({
      mode: deps.mode,
      version: deps.appVersion.getVersion(),
      push: { status: 'loading', values: null, saving: NOT_SAVING },
      devicePermission: null,
      dialog: 'none',
      openDocument: null,
    });
    this.authErrors = new AuthErrorPolicy(deps.authFlow);
  }

  get account(): AccountActionsViewModel {
    return this.deps.account;
  }

  get signatureCard(): SignatureCardViewModel {
    return this.deps.signatureCard;
  }

  /** openDocument가 null이면 null. */
  get document(): TermsDocumentViewModel | null {
    return this.documentViewModel;
  }

  /** 설정 탭이 보인다(진입·복귀). screen_view를 보내고 회원은 사인·푸시 설정·권한을 (재)조회한다. 게스트는 API를 부르지 않는다. */
  async onShown(): Promise<void> {
    this.sendScreenView();
    if (this.deps.mode !== 'member' || this.released) return;
    this.stopVisibility ??= this.deps.visibility.subscribe((state) => {
      if (state === 'foreground') void this.refreshPermission();
    });
    await Promise.all([
      this.deps.signatureCard.refresh(),
      this.loadPush(),
      this.refreshPermission(),
    ]);
  }

  /** 설정 탭이 안 보인다: 조회를 취소하고, 저장 중인 항목은 조용히 되돌린다. */
  onHidden(): void {
    this.stopVisibility?.();
    this.stopVisibility = null;
    this.generation += 1;
    this.loadController?.abort();
    this.loadController = null;
    const values = this.getSnapshot().push.values;
    if (this.inFlight.size > 0 && values !== null) {
      const reverted = { ...values };
      for (const [key, entry] of this.inFlight) {
        entry.controller.abort();
        reverted[key] = entry.previous;
      }
      this.inFlight.clear();
      this.patchPush({ values: reverted, saving: NOT_SAVING });
    }
  }

  retryPush(): Promise<void> {
    return this.deps.mode === 'member' ? this.loadPush() : Promise.resolve();
  }

  /**
   * 스위치를 눌렀다. 켜려는데 기기 권한이 꺼져 있으면 서버 값을 바꾸지 않고 시스템 설정으로 보낸다(REQ-SET-015).
   * 미결정이면 권한을 요청하고 허용될 때만 저장한다(REQ-SET-018). 끄는 것은 권한과 무관하다(REQ-SET-016).
   */
  async onPushToggle(key: PushSettingKey): Promise<void> {
    const { push } = this.getSnapshot();
    if (this.deps.mode !== 'member' || push.status !== 'ready' || push.values === null) return;
    if (!PUSH_SETTING_KEYS.includes(key) || this.inFlight.has(key)) return;
    const previous = push.values[key];
    const target = !previous;
    const token = ++this.tokenSeq;
    const generation = this.generation;
    const controller = new AbortController();
    this.inFlight.set(key, { token, controller, previous });
    this.patchPush({ saving: { ...push.saving, [key]: true } });

    if (target && !(await this.allowTurningOn())) {
      if (this.inFlight.get(key)?.token === token) {
        this.inFlight.delete(key);
        this.setSaving(key, false);
      }
      return;
    }
    if (this.inFlight.get(key)?.token !== token || generation !== this.generation) return;

    this.setValue(key, target);
    try {
      await this.deps.settings.update(key, target, controller.signal);
    } catch (error) {
      if (this.inFlight.get(key)?.token !== token) return;
      this.inFlight.delete(key);
      this.setValue(key, previous);
      this.setSaving(key, false);
      if (error instanceof CancelledError || this.authErrors.handle(error, token)) return;
      this.deps.toast.show(t('settings.push.save-error'));
      return;
    }
    if (this.inFlight.get(key)?.token !== token) return;
    this.inFlight.delete(key);
    this.setSaving(key, false);
  }

  /** "피드백 보내기". 게스트는 화면 없이 토스트만(REQ-FDBK-001). */
  onFeedbackPress(): void {
    if (this.deps.mode === 'guest') {
      this.deps.toast.show(t('nav.guest.feedback'));
      return;
    }
    this.deps.navigator.openFeedback();
  }

  onPrivacyPress(): void {
    this.openDocument('privacy');
  }

  onTermsPress(): void {
    this.openDocument('service');
  }

  closeDocument(): void {
    if (this.documentViewModel === null) return;
    this.documentViewModel.dispose();
    this.documentViewModel = null;
    this.setState({ ...this.getSnapshot(), openDocument: null });
  }

  onLogoutPress(): void {
    this.setState({ ...this.getSnapshot(), dialog: 'logout' });
  }

  onWithdrawPress(): void {
    this.setState({ ...this.getSnapshot(), dialog: 'withdraw' });
  }

  onDialogCancel(): void {
    this.setState({ ...this.getSnapshot(), dialog: 'none' });
  }

  /** 확정. 처리 중에는 대화상자가 열려 있고(확인 버튼 비활성) 연타는 무시한다. 끝나면 닫는다. */
  async onDialogConfirm(): Promise<void> {
    const { dialog } = this.getSnapshot();
    if (dialog === 'none' || this.confirming) return;
    this.confirming = true;
    try {
      if (dialog === 'logout') await this.deps.account.confirmLogout();
      else await this.deps.account.confirmWithdraw();
    } finally {
      this.confirming = false;
      if (!this.released) this.setState({ ...this.getSnapshot(), dialog: 'none' });
    }
  }

  /** 게스트 "로그인" 버튼. */
  onLoginPress(): Promise<void> {
    return this.deps.account.loginFromGuest();
  }

  /** 로그아웃·탈퇴·계정 전환: 진행 중 요청을 버리고 이전 계정의 값을 지운다. */
  clearAll(): void {
    this.generation += 1;
    this.loadController?.abort();
    this.loadController = null;
    this.inFlight.forEach((entry) => entry.controller.abort());
    this.inFlight.clear();
    this.deps.signatureCard.clearAll();
    this.closeDocument();
    this.setState({
      ...this.getSnapshot(),
      push: { status: 'loading', values: null, saving: NOT_SAVING },
      devicePermission: null,
      dialog: 'none',
    });
  }

  override dispose(): void {
    this.released = true;
    this.onHidden();
    this.closeDocument();
    this.deps.signatureCard.dispose();
    this.deps.account.dispose();
    super.dispose();
  }

  private sendScreenView(): void {
    try {
      this.deps.analytics.screenView('settings');
    } catch {
      // 분석 실패는 화면 동작에 영향을 주지 않는다(REQ-ANL-008).
    }
  }

  private async loadPush(): Promise<void> {
    this.loadController?.abort();
    const controller = new AbortController();
    this.loadController = controller;
    const generation = ++this.generation;
    this.patchPush({ status: 'loading' });
    try {
      const values = await this.deps.settings.get(controller.signal);
      if (generation !== this.generation) return;
      this.patchPush({ status: 'ready', values });
    } catch (error) {
      if (generation !== this.generation || error instanceof CancelledError) return;
      this.patchPush({ status: 'error', values: null });
      // 401은 정책/세션 이벤트가 로그인으로 보낸다. 그 밖에는 토스트(REQ-SET-010).
      if (!this.authErrors.handle(error, generation)) {
        this.deps.toast.show(t('settings.push.load-error'));
      }
    }
  }

  private async refreshPermission(): Promise<void> {
    try {
      const devicePermission = await this.deps.permission.status();
      if (!this.released) this.setState({ ...this.getSnapshot(), devicePermission });
    } catch {
      // 권한을 읽지 못해도 서버 설정 화면은 그대로 쓴다. 스위치를 켤 때 다시 확인한다.
    }
  }

  /** 켜기 전 기기 권한 확인. 꺼져 있으면 시스템 설정을 열고 false. */
  private async allowTurningOn(): Promise<boolean> {
    const { permission } = this.deps;
    let status: PushPermissionStatus;
    try {
      status = await permission.status();
      if (status === 'undetermined') status = await permission.request();
    } catch {
      // 권한 확인 자체가 실패하면 막지 않고 서버 저장 흐름을 따른다.
      return true;
    }
    if (status === 'denied') {
      await permission.openSystemSettings().catch(() => undefined);
    }
    return status === 'granted';
  }

  private openDocument(kind: TermsKind): void {
    if (this.released || this.documentViewModel !== null) return;
    const document = new TermsDocumentViewModel({
      kind,
      url: TERMS_URLS[kind],
      analytics: this.deps.analytics,
      linkOpener: this.deps.linkOpener,
    });
    this.documentViewModel = document;
    this.setState({ ...this.getSnapshot(), openDocument: kind });
    void document.start().then(() => {
      // 외부 브라우저로 열렸으면 앱 안 시트는 필요 없다.
      const { inAppUrl, status } = document.getSnapshot();
      if (this.documentViewModel === document && inAppUrl === null && status === 'loaded') {
        this.closeDocument();
      }
    });
  }

  private patchPush(patch: Partial<PushSettingsState>): void {
    const state = this.getSnapshot();
    this.setState({ ...state, push: { ...state.push, ...patch } });
  }

  private setValue(key: PushSettingKey, value: boolean): void {
    const { values } = this.getSnapshot().push;
    if (values !== null) this.patchPush({ values: { ...values, [key]: value } });
  }

  private setSaving(key: PushSettingKey, saving: boolean): void {
    this.patchPush({ saving: { ...this.getSnapshot().push.saving, [key]: saving } });
  }
}
