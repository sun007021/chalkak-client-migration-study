import { useCallback, useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { ROUTES, SETTINGS_BELOW_STATE } from '../../app/paths';
import { t } from '../../copy/ko';
import type { CopyKey } from '../../copy/ko';
import { webOnlyCopy } from '../../copy/webOnly';
import { useScreenView } from '../../core/analytics/useScreenView';
import { useOwnedViewModel } from '../../core/state/useOwnedViewModel';
import { useSubscribed } from '../../core/state/useSubscribed';
import { useViewModel } from '../../core/state/useViewModel';
import { ConfirmDialog } from '../../core/ui/ConfirmDialog';
import { useShellContext } from '../shell/MainShell';
import type { NotificationSettingsStore } from './NotificationSettingsStore';
import { PUSH_SETTING_KEYS } from './NotificationSettingsRepository';
import type { PushSettingKey } from './NotificationSettingsRepository';
import type { SettingsViewModel } from './SettingsViewModel';
import type { SignatureCardController } from '../signature/SignatureCardController';

/**
 * 설정 탭 화면. 로직은 SettingsViewModel(화면 상태), SignatureCardController(사인 카드), NotificationSettingsStore(푸시 설정)에 있고 여기서는 그리기만 한다.
 * 화면이 붙으면 onShown(사인·푸시 설정 조회), 문서가 다시 보이면 onShown, 화면이 떨어질 때만 onHidden(진행 중 푸시 저장 취소; 문서가 가려지는 것만으로는 취소하지 않는다).
 */
export function SettingsScreen(): ReactNode {
  const { mode } = useShellContext();
  const container = useContainer();
  useScreenView('settings');
  const create = useCallback(() => container.createSettingsViewModel(mode), [container, mode]);
  const vm = useOwnedViewModel(create);

  useEffect(() => {
    if (!vm) return;
    vm.onShown();
    // 문서가 가려져도 진행 중인 푸시 저장은 취소하지 않는다(취소·복원은 화면을 떠날 때만). 다시 보이면 서버 값을 다시 읽는다.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') vm.onShown();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      vm.onHidden();
    };
  }, [vm]);

  if (!vm) return null;
  return <SettingsView vm={vm} signatureCard={container.signatureCard} notifications={container.notificationSettings} />;
}

const page: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16, padding: 16, paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px) + 16px)' };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const headingStyle: CSSProperties = { margin: 0, fontSize: 14 };
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44, padding: '0 8px', textAlign: 'left' };

function SettingsView({ vm, signatureCard, notifications }: { vm: SettingsViewModel; signatureCard: SignatureCardController; notifications: NotificationSettingsStore }): ReactNode {
  const state = useViewModel(vm);
  const subscribed = useSubscribed();
  const navigate = useNavigate();

  if (!subscribed) return null;
  if (state.mode === 'guest') {
    return (
      <div data-testid="settings.root" style={page}>
        <button type="button" data-testid="settings.login-button" style={{ minHeight: 44 }} onClick={() => void vm.pressLogin().then(() => navigate(ROUTES.login, { replace: true }))}>
          {t('settings.guest.login')}
        </button>
      </div>
    );
  }

  return (
    <div data-testid="settings.root">
      <div style={page}>
        <section style={sectionStyle}>
          <h2 style={headingStyle}>{t('settings.section.app')}</h2>
          <SignatureCard card={signatureCard} onChange={() => void navigate(ROUTES.changeSignature, { state: SETTINGS_BELOW_STATE })} />
        </section>
        <PushSection store={notifications} />
        <AccountSection vm={vm} />
        <section style={sectionStyle}>
          <h2 style={headingStyle}>{t('settings.section.feedback')}</h2>
          <button type="button" data-testid="settings.feedback-row" style={rowStyle} onClick={() => void navigate(ROUTES.feedback, { state: SETTINGS_BELOW_STATE })}>
            {t('settings.row.feedback')}
          </button>
        </section>
        <InfoSection vm={vm} documentOpenFailed={state.documentOpenFailed} appVersion={state.appVersion} />
      </div>
      {state.dialog === 'logout' ? (
        <ConfirmDialog
          testIdPrefix="settings.logout"
          message={t('auth.logout.confirm.message')}
          confirmLabel={t('auth.logout.confirm.ok')}
          busy={state.busy !== null}
          onConfirm={() => void vm.confirmLogout()}
          onCancel={() => vm.cancelDialog()}
        />
      ) : null}
      {state.dialog === 'withdraw' ? (
        <ConfirmDialog
          testIdPrefix="settings.withdraw"
          message={t('auth.withdraw.confirm.message')}
          confirmLabel={t('auth.withdraw.confirm.ok')}
          busy={state.busy !== null}
          destructive
          onConfirm={() => void vm.confirmWithdraw()}
          onCancel={() => vm.cancelDialog()}
        />
      ) : null}
    </div>
  );
}

function SignatureCard({ card, onChange }: { card: SignatureCardController; onChange: () => void }): ReactNode {
  const state = useViewModel(card);
  const showLoading = state.imageUrl === null && (state.status === 'idle' || state.status === 'loading');
  return (
    <div data-testid="settings.signature-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
      <span>{t('sign.card.title')}</span>
      {state.imageUrl !== null ? <img data-testid="settings.signature-image" src={state.imageUrl} alt={webOnlyCopy['settings.signature-alt']} style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain' }} /> : null}
      {showLoading ? (
        <span data-testid="settings.signature-loading" role="status" aria-busy="true">
          {webOnlyCopy['settings.signature-loading']}
        </span>
      ) : null}
      {state.status === 'error' ? (
        <div>
          <p data-testid="settings.signature-error" style={{ margin: 0 }}>
            {t('sign.load.error')}
          </p>
          <button type="button" data-testid="settings.signature-retry-button" style={{ minHeight: 44 }} onClick={() => void card.refresh()}>
            {t('common.retry')}
          </button>
        </div>
      ) : null}
      <button type="button" data-testid="settings.signature-change-button" style={{ minHeight: 44 }} onClick={onChange}>
        {t('sign.card.change')}
      </button>
    </div>
  );
}

const PUSH_ITEMS: Readonly<Record<PushSettingKey, { label: CopyKey; testId: string }>> = {
  topicPushEnabled: { label: 'settings.push.topic', testId: 'settings.push-topic-toggle' },
  moderationPushEnabled: { label: 'settings.push.moderation', testId: 'settings.push-moderation-toggle' },
  aiReviewPushEnabled: { label: 'settings.push.ai-review', testId: 'settings.push-ai-toggle' },
};

function PushSection({ store }: { store: NotificationSettingsStore }): ReactNode {
  const state = useViewModel(store);
  const ready = state.status === 'ready' && state.values !== null;
  // 다시 읽는 동안에는 이전 값을 그대로 보이고(깜빡임 없음) 비활성만 한다. 값이 없으면(최초 로딩·조회 실패) 꺼짐으로 보인다.
  return (
    <section data-testid="settings.push-section" style={sectionStyle}>
      <h2 style={headingStyle}>{t('settings.section.push')}</h2>
      {state.status === 'idle' || state.status === 'loading' ? (
        <span data-testid="settings.push-loading" role="status" aria-busy="true">
          {webOnlyCopy['settings.push-loading']}
        </span>
      ) : null}
      {state.status === 'error' ? (
        <div>
          <p data-testid="settings.push-error" style={{ margin: 0 }}>
            {t('settings.push.load-error')}
          </p>
          <button type="button" data-testid="settings.push-retry-button" style={{ minHeight: 44 }} onClick={() => void store.load()}>
            {t('common.retry')}
          </button>
        </div>
      ) : null}
      {PUSH_SETTING_KEYS.map((key) => {
        const item = PUSH_ITEMS[key];
        const checked = state.values?.[key] === true;
        return (
          <button
            key={key}
            type="button"
            role="switch"
            aria-checked={checked}
            aria-busy={state.saving[key] || undefined}
            disabled={!ready}
            data-testid={item.testId}
            style={rowStyle}
            onClick={() => void store.toggle(key)}
          >
            <span>{t(item.label)}</span>
            <span aria-hidden="true">{checked ? 'ON' : 'OFF'}</span>
          </button>
        );
      })}
    </section>
  );
}

function AccountSection({ vm }: { vm: SettingsViewModel }): ReactNode {
  return (
    <section style={sectionStyle}>
      <h2 style={headingStyle}>{t('settings.section.account')}</h2>
      <button type="button" data-testid="settings.logout-row" style={rowStyle} onClick={() => vm.requestLogout()}>
        {t('settings.row.logout')}
      </button>
      <button type="button" data-testid="settings.withdraw-row" style={rowStyle} onClick={() => vm.requestWithdraw()}>
        {t('settings.row.withdraw')}
      </button>
    </section>
  );
}

function InfoSection({ vm, documentOpenFailed, appVersion }: { vm: SettingsViewModel; documentOpenFailed: boolean; appVersion: string }): ReactNode {
  return (
    <section style={sectionStyle}>
      <h2 style={headingStyle}>{t('settings.section.info')}</h2>
      <button type="button" data-testid="settings.privacy-row" style={rowStyle} onClick={() => vm.openDocument('privacy')}>
        {t('settings.row.privacy')}
      </button>
      <button type="button" data-testid="settings.terms-row" style={rowStyle} onClick={() => vm.openDocument('service')}>
        {t('settings.row.terms')}
      </button>
      {documentOpenFailed ? (
        <p data-testid="legal-doc.open-failed-message" role="alert" style={{ margin: 0 }}>
          {t('onb.terms.doc.cannot-open')}
        </p>
      ) : null}
      <div data-testid="settings.version-row" style={rowStyle}>
        <span>{t('settings.row.version')}</span>
        <span data-testid="settings.version-value">{appVersion}</span>
      </div>
    </section>
  );
}
