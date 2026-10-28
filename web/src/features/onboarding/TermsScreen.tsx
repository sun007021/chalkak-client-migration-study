import { useCallback } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { ROUTES } from '../../app/paths';
import { t } from '../../copy/ko';
import { useOwnedViewModel } from '../../core/state/useOwnedViewModel';
import { useViewModel } from '../../core/state/useViewModel';
import { useSignupGate } from './useSignupGate';
import type { LegalDocumentKind } from './LegalDocument';
import type { TermsOutcome, TermsViewModel } from './TermsViewModel';

/**
 * 약관 화면(/signup/terms). data-testid: terms.root, terms.title, terms.agree-all-checkbox, terms.service-checkbox, terms.privacy-checkbox
 * (role="checkbox" + aria-checked), terms.service-view-button, terms.privacy-view-button, terms.next-button(canProceed 전 disabled), terms.back-button,
 * 열기 실패 시 legal-doc.open-failed-message. SignupDraft가 없으면(새로고침 등) /login으로 replace하고 화면을 그리지 않는다. screen_view 'terms'는 전역 경로 추적이 보낸다.
 */
export function TermsScreen(): ReactNode {
  const container = useContainer();
  const gate = useSignupGate(true);
  const ok = gate.kind === 'ok';
  const create = useCallback(() => (ok ? container.createTermsViewModel() : null), [container, ok]);
  const vm = useOwnedViewModel(create);
  if (gate.kind === 'redirect') return <Navigate to={gate.to} replace />;
  return vm ? <TermsView vm={vm} /> : null;
}

const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 0' };
const checkboxStyle: CSSProperties = { flex: 1, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minHeight: 44 };

function CheckMark({ checked }: { checked: boolean }): ReactNode {
  return (
    <span aria-hidden="true" style={{ width: 20, height: 20, border: '2px solid #111', borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: checked ? '#111' : 'transparent', color: '#fff', fontSize: 14 }}>
      {checked ? '✓' : ''}
    </span>
  );
}

/** div role=checkbox: 네이티브 button과 달리 Space가 click을 따로 만들지 않아 키 처리를 한 곳에서 한다. */
function Checkbox({ testId, checked, label, onToggle }: { testId: string; checked: boolean; label: string; onToggle: () => void }): ReactNode {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    onToggle();
  };
  return (
    <div role="checkbox" aria-checked={checked} tabIndex={0} data-testid={testId} style={checkboxStyle} onClick={onToggle} onKeyDown={onKeyDown}>
      <CheckMark checked={checked} />
      <span>{label}</span>
    </div>
  );
}

function TermsView({ vm }: { vm: TermsViewModel }): ReactNode {
  const navigate = useNavigate();
  const state = useViewModel(vm);
  const go = (outcome: TermsOutcome) => {
    if (outcome.kind === 'signature') navigate(ROUTES.signupSignature);
    else if (outcome.kind === 'login') navigate(ROUTES.login, { replace: true });
  };
  const open = (kind: LegalDocumentKind) => () => void vm.openDocument(kind);
  return (
    <div data-testid="terms.root" style={{ minHeight: '100dvh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
      <button type="button" data-testid="terms.back-button" style={{ alignSelf: 'flex-start', minHeight: 44 }} onClick={() => go(vm.back())}>
        ←
      </button>
      <h1 data-testid="terms.title" style={{ whiteSpace: 'pre-line' }}>
        {t('onb.terms.title')}
      </h1>
      <Checkbox testId="terms.agree-all-checkbox" checked={state.allAgreed} label={t('onb.terms.agree-all')} onToggle={() => vm.toggleAll()} />
      <div style={rowStyle}>
        <Checkbox testId="terms.service-checkbox" checked={state.serviceAgreed} label={t('onb.terms.service')} onToggle={() => vm.toggleService()} />
        <button type="button" data-testid="terms.service-view-button" style={{ minHeight: 44 }} onClick={open('service')}>
          {t('onb.terms.view')}
        </button>
      </div>
      <div style={rowStyle}>
        <Checkbox testId="terms.privacy-checkbox" checked={state.privacyAgreed} label={t('onb.terms.privacy')} onToggle={() => vm.togglePrivacy()} />
        <button type="button" data-testid="terms.privacy-view-button" style={{ minHeight: 44 }} onClick={open('privacy')}>
          {t('onb.terms.view')}
        </button>
      </div>
      {state.openFailed && (
        <p data-testid="legal-doc.open-failed-message" role="alert">
          {t('onb.terms.doc.cannot-open')}
        </p>
      )}
      <button type="button" data-testid="terms.next-button" disabled={!state.canProceed} style={{ marginTop: 'auto', minHeight: 48 }} onClick={() => go(vm.next())}>
        {t('onb.terms.next')}
      </button>
    </div>
  );
}
