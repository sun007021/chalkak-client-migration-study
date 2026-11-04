import { useCallback, useState } from 'react';
import type { CSSProperties, FocusEvent, KeyboardEvent, ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { ROUTES } from '../../app/paths';
import { t } from '../../copy/ko';
import { useOwnedViewModel } from '../../core/state/useOwnedViewModel';
import { useViewModel } from '../../core/state/useViewModel';
import { color, font, radius } from '../../design/tokens';
import { Button } from '../../core/ui/Button';
import { CheckboxIcon } from '../../core/ui/Checkbox';
import { BackButton } from '../../core/ui/TopBar';
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

// 원본 약관 화면(screens-a §5): 배경 inputBackground, 필수 행은 위아래 16·왼쪽 4, 체크박스와 제목 사이 14, 행 뒤 1px 구분선.
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${color.border}` };
const checkboxStyle: CSSProperties = { flex: 1, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', minHeight: 48, padding: '0 0 0 4px', ...font('body') };
// 전체 동의 행: 카드(라운드 16, 테두리 #E3E1DD), 안쪽 16/19, 체크박스와 글자 16.
const cardStyle: CSSProperties = { flex: 1, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', minHeight: 48, padding: '19px 16px', border: '1px solid #E3E1DD', borderRadius: radius.large, background: color.inputBackground, ...font('body') };
const viewButtonStyle: CSSProperties = { minHeight: 48, padding: '16px 4px 16px 12px', border: 0, background: 'none', color: color.textMuted, ...font('callout') };

/** div role=checkbox: 네이티브 button과 달리 Space가 click을 따로 만들지 않아 키 처리를 한 곳에서 한다. */
function Checkbox({ testId, checked, label, onToggle, card = false }: { testId: string; checked: boolean; label: string; onToggle: () => void; card?: boolean }): ReactNode {
  // 키보드로 포커스가 왔을 때만 윤곽선을 보인다(마우스 클릭 포커스는 제외).
  const [focusVisible, setFocusVisible] = useState(false);
  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    try {
      setFocusVisible(event.currentTarget.matches(':focus-visible'));
    } catch {
      setFocusVisible(true);
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== ' ') return;
    event.preventDefault();
    onToggle();
  };
  return (
    <div role="checkbox" aria-checked={checked} tabIndex={0} data-testid={testId} style={focusVisible ? { ...(card ? cardStyle : checkboxStyle), outline: `2px solid ${color.accent}`, outlineOffset: 2, borderRadius: 4 } : card ? cardStyle : checkboxStyle}
      onClick={onToggle}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={() => setFocusVisible(false)}
    >
      <CheckboxIcon checked={checked} />
      <span style={card ? { color: color.textPrimary } : { color: 'rgba(43, 39, 36, 0.85)' }}>{label}</span>
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
    <div
      data-testid="terms.root"
      className="ck-screen"
      style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', padding: 'calc(var(--safe-top) + var(--space-sm)) var(--space-screen-horizontal) calc(20px + var(--safe-bottom))', background: color.inputBackground }}
    >
      <div style={{ marginLeft: -12 }}>
        <BackButton testId="terms.back-button" onClick={() => go(vm.back())} />
      </div>
      <h1 data-testid="terms.title" style={{ marginTop: 'var(--space-lg)', whiteSpace: 'pre-line', ...font('title1'), color: color.textPrimary }}>
        {t('onb.terms.title')}
      </h1>
      <div style={{ marginTop: 57 }}>
        <Checkbox card testId="terms.agree-all-checkbox" checked={state.allAgreed} label={t('onb.terms.agree-all')} onToggle={() => vm.toggleAll()} />
      </div>
      <div style={{ marginTop: 3 }}>
        <div style={rowStyle}>
          <Checkbox testId="terms.service-checkbox" checked={state.serviceAgreed} label={t('onb.terms.service')} onToggle={() => vm.toggleService()} />
          <button type="button" data-testid="terms.service-view-button" style={viewButtonStyle} onClick={open('service')}>
            {t('onb.terms.view')}
          </button>
        </div>
        <div style={rowStyle}>
          <Checkbox testId="terms.privacy-checkbox" checked={state.privacyAgreed} label={t('onb.terms.privacy')} onToggle={() => vm.togglePrivacy()} />
          <button type="button" data-testid="terms.privacy-view-button" style={viewButtonStyle} onClick={open('privacy')}>
            {t('onb.terms.view')}
          </button>
        </div>
      </div>
      {state.openFailed && (
        <p data-testid="legal-doc.open-failed-message" role="alert" style={{ marginTop: 'var(--space-md)', color: color.error, ...font('footnote') }}>
          {t('onb.terms.doc.cannot-open')}
        </p>
      )}
      <div style={{ marginTop: 'auto', paddingTop: 'var(--space-xl)' }}>
        <Button fill data-testid="terms.next-button" disabled={!state.canProceed} onClick={() => go(vm.next())}>
          {t('onb.terms.next')}
        </Button>
      </div>
    </div>
  );
}
