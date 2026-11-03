import { useCallback, useEffect, useId, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { ROUTES, SETTINGS_BELOW_STATE } from '../../app/paths';
import { t } from '../../copy/ko';
import type { CopyKey } from '../../copy/ko';
import { webOnlyCopy } from '../../copy/webOnly';
import { useScreenView } from '../../core/analytics/useScreenView';
import { useOwnedViewModel } from '../../core/state/useOwnedViewModel';
import { useViewModel } from '../../core/state/useViewModel';
import { useDialogFocus } from '../../core/ui/useDialogFocus';
import { useShellContext } from '../shell/MainShell';
import type { NotificationSettingsStore } from './NotificationSettingsStore';
import { PUSH_SETTING_KEYS } from './NotificationSettingsRepository';
import type { PushSettingKey } from './NotificationSettingsRepository';
import type { SettingsViewModel } from './SettingsViewModel';
import type { SignatureCardController } from '../signature/SignatureCardController';

/**
 * 설정 탭 화면. 로직은 SettingsViewModel(화면 상태), SignatureCardController(사인 카드), NotificationSettingsStore(푸시 설정)에 있고 여기서는 그리기만 한다.
 * 화면이 붙으면 onShown(사인·푸시 설정 조회), 문서가 다시 보이면 onShown, 숨겨지거나 떨어지면 onHidden(진행 중 푸시 저장 취소).
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
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') vm.onHidden();
      else vm.onShown();
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
const overlay: CSSProperties = { position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', padding: 16 };
const sheet: CSSProperties = { background: 'var(--color-surface, #fff)', color: 'inherit', borderRadius: 12, padding: 16, maxWidth: 360, width: '100%' };

function SettingsView({ vm, signatureCard, notifications }: { vm: SettingsViewModel; signatureCard: SignatureCardController; notifications: NotificationSettingsStore }): ReactNode {
  const state = useViewModel(vm);
  const navigate = useNavigate();

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
        <section style={sectionStyle}>
          <h2 style={headingStyle}>{t('settings.section.account')}</h2>
          <button type="button" data-testid="settings.logout-row" style={rowStyle} onClick={() => vm.requestLogout()}>
            {t('settings.row.logout')}
          </button>
          <button type="button" data-testid="settings.withdraw-row" style={rowStyle} onClick={() => vm.requestWithdraw()}>
            {t('settings.row.withdraw')}
          </button>
        </section>
        <section style={sectionStyle}>
          <h2 style={headingStyle}>{t('settings.section.feedback')}</h2>
          <button type="button" data-testid="settings.feedback-row" style={rowStyle} onClick={() => void navigate(ROUTES.feedback, { state: SETTINGS_BELOW_STATE })}>
            {t('settings.row.feedback')}
          </button>
        </section>
        <section style={sectionStyle}>
          <h2 style={headingStyle}>{t('settings.section.info')}</h2>
          <button type="button" data-testid="settings.privacy-row" style={rowStyle} onClick={() => vm.openDocument('privacy')}>
            {t('settings.row.privacy')}
          </button>
          <button type="button" data-testid="settings.terms-row" style={rowStyle} onClick={() => vm.openDocument('service')}>
            {t('settings.row.terms')}
          </button>
          {state.documentOpenFailed ? (
            <p data-testid="legal-doc.open-failed-message" role="alert" style={{ margin: 0 }}>
              {t('onb.terms.doc.cannot-open')}
            </p>
          ) : null}
          <div data-testid="settings.version-row" style={rowStyle}>
            <span>{t('settings.row.version')}</span>
            <span data-testid="settings.version-value">{state.appVersion}</span>
          </div>
        </section>
      </div>
      {state.dialog === 'logout' ? (
        <ConfirmDialog
          kind="logout"
          message={t('auth.logout.confirm.message')}
          confirmLabel={t('auth.logout.confirm.ok')}
          busy={state.busy !== null}
          onConfirm={() => void vm.confirmLogout()}
          onCancel={() => vm.cancelDialog()}
        />
      ) : null}
      {state.dialog === 'withdraw' ? (
        <ConfirmDialog
          kind="withdraw"
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
        const checked = ready && state.values?.[key] === true;
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

function ConfirmDialog({ kind, message, confirmLabel, busy, destructive, onConfirm, onCancel }: { kind: 'logout' | 'withdraw'; message: string; confirmLabel: string; busy: boolean; destructive?: boolean; onConfirm: () => void; onCancel: () => void }): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const messageId = useId();
  // 되돌릴 수 없는 동작이라 처음 포커스는 취소에 둔다. 처리 중에는 Esc도 무시한다.
  useDialogFocus(ref, busy ? undefined : onCancel, cancelRef);
  return (
    <div style={overlay}>
      <div ref={ref} data-testid={`settings.${kind}-dialog`} role="alertdialog" aria-modal="true" aria-labelledby={messageId} style={sheet}>
        <p id={messageId} style={{ marginTop: 0 }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button ref={cancelRef} type="button" data-testid={`settings.${kind}-cancel-button`} style={{ minHeight: 44 }} onClick={onCancel}>
            {t('auth.confirm.cancel')}
          </button>
          <button type="button" data-testid={`settings.${kind}-confirm-button`} data-emphasis={destructive ? 'destructive' : undefined} disabled={busy} style={{ minHeight: 44 }} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
