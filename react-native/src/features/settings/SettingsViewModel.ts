import type { AnalyticsTracker } from '../../core/analytics/AnalyticsTracker';
import type { ExternalLinkOpener } from '../../core/linking/ExternalLinkOpener';
import type { AppVersionProvider } from '../../core/config/AppVersionProvider';
import type { PushPermissionGateway } from '../../core/push/PushPermissionGateway';
import type { UserDataCache } from '../../core/push/UserDataCache';
import { Observable } from '../../core/state/Observable';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type {
  NotificationSettingsRepository,
  PushSettingKey,
} from '../../data/settings/NotificationSettingsRepository';
import { TERMS_URLS } from '../../shared/constants';
import { t } from '../../shared/copy';
import type { AccountActionsViewModel } from '../auth/AccountActionsViewModel';
import type { AuthFlowNavigator, MainMode } from '../auth/AuthFlowNavigator';
import { TermsDocumentViewModel } from '../onboarding/TermsDocumentViewModel';
import type { TermsKind } from '../onboarding/TermsViewModel';
import type { SignatureCardViewModel } from '../signature/SignatureCardViewModel';
import { PushSettingsController, type PushSettingsState } from './PushSettingsController';
import type { SettingsNavigator } from './SettingsNavigator';

export type { PushSettingsState };

export type SettingsState = {
  mode: MainMode;
  version: string;
  push: PushSettingsState;
  dialog: 'none' | 'logout' | 'withdraw';
  openDocument: TermsKind | null;
};

export type SettingsViewModelDeps = {
  mode: MainMode;
  settings: NotificationSettingsRepository;
  signatureCard: SignatureCardViewModel;
  account: AccountActionsViewModel;
  permission: PushPermissionGateway;
  appVersion: AppVersionProvider;
  analytics: AnalyticsTracker;
  linkOpener: ExternalLinkOpener;
  toast: ToastPresenter;
  navigator: SettingsNavigator;
  authFlow: Pick<AuthFlowNavigator, 'toLogin'>;
};

/**
 * 설정 탭. 소유자(SettingsViewModelOwner)가 메인 단계 동안 만들고 버리며, 계정 전환 때 비우도록 UserDataCache를 구현한다.
 * 하위 ViewModel(사인 카드, 계정 동작)과 약관 문서 ViewModel은 여기서 버린다.
 *
 * - 푸시 설정: PushSettingsController가 조회·토글·권한 확인·이탈 시 되돌림을 맡고 여기서는 상태를 합성만 한다.
 * - screen_view는 onShown(탭 마운트)마다 보낸다. 개발 모드 StrictMode의 이중 effect는 한 번 더 보낼 수 있다(홈·전시·기록의
 *   useFocusEffect와 같은 동작이고 운영 빌드에는 영향이 없다).
 */
export class SettingsViewModel extends Observable<SettingsState> implements UserDataCache {
  private readonly push: PushSettingsController;
  private stopPush: (() => void) | null = null;
  private documentViewModel: TermsDocumentViewModel | null = null;
  private confirming = false;
  private released = false;

  constructor(private readonly deps: SettingsViewModelDeps) {
    super({
      mode: deps.mode,
      version: deps.appVersion.getVersion(),
      push: {
        status: 'loading',
        values: null,
        saving: { topic: false, moderation: false, aiReview: false },
      },
      dialog: 'none',
      openDocument: null,
    });
    this.push = new PushSettingsController({
      settings: deps.settings,
      permission: deps.permission,
      toast: deps.toast,
      authFlow: deps.authFlow,
    });
    this.stopPush = this.push.subscribe(() =>
      this.setState({ ...this.getSnapshot(), push: this.push.getSnapshot() }),
    );
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
    await Promise.all([this.deps.signatureCard.refresh(), this.push.load()]);
  }

  /** 설정 탭이 안 보인다: 조회를 취소하고, 저장 중인 항목은 조용히 되돌린다. */
  onHidden(): void {
    this.push.suspend();
  }

  retryPush(): Promise<void> {
    return this.deps.mode === 'member' ? this.push.load() : Promise.resolve();
  }

  /** 푸시 스위치. 게스트·미로딩은 무시한다. 권한 흐름과 저장은 PushSettingsController가 맡는다. */
  onPushToggle(key: PushSettingKey): Promise<void> {
    return this.deps.mode === 'member' ? this.push.toggle(key) : Promise.resolve();
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
    this.push.reset();
    this.deps.signatureCard.clearAll();
    this.closeDocument();
    this.setState({ ...this.getSnapshot(), dialog: 'none' });
  }

  override dispose(): void {
    this.released = true;
    this.push.suspend();
    this.stopPush?.();
    this.stopPush = null;
    this.push.dispose();
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
}
