import { useCallback, useId } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { ROUTES, isSettingsBelow } from '../../app/paths';
import { FEEDBACK_MAX } from '../../constants';
import { t } from '../../copy/ko';
import { useScreenView } from '../../core/analytics/useScreenView';
import { useOwnedViewModel } from '../../core/state/useOwnedViewModel';
import { useViewModel } from '../../core/state/useViewModel';
import { color, font, space } from '../../design/tokens';
import { Button } from '../../core/ui/Button';
import { CloseButton, TopBar } from '../../core/ui/TopBar';
import type { FeedbackViewModel } from './FeedbackViewModel';

/**
 * 피드백 화면(/feedback, 회원만, 탭 셸 밖). 로직은 FeedbackViewModel에 있고 여기서는 그리기만 한다. 마운트마다 새 ViewModel이라 입력은 항상 비어 있다.
 * screen_view(feedback) 1회. 닫기·성공 뒤 설정으로(설정에서 SETTINGS_BELOW_STATE로 push했으면 뒤로, 아니면 replace).
 */
export function FeedbackScreen(): ReactNode {
  const container = useContainer();
  useScreenView('feedback');
  const create = useCallback(() => container.createFeedbackViewModel(), [container]);
  const vm = useOwnedViewModel(create);
  if (!vm) return null;
  return <FeedbackView vm={vm} />;
}

const page: CSSProperties = { minHeight: '100dvh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', background: color.background };
const body: CSSProperties = { display: 'flex', flexDirection: 'column', gap: space.md, padding: `${space.md}px ${space.lg}px ${space.xl}px` };
const note: CSSProperties = { margin: 0, color: color.error, ...font('caption') };

function FeedbackView({ vm }: { vm: FeedbackViewModel }): ReactNode {
  const state = useViewModel(vm);
  const navigate = useNavigate();
  const below = isSettingsBelow(useLocation());
  const inputId = useId();
  const counterId = useId();
  const leave = () => void (below ? navigate(-1) : navigate(ROUTES.settings, { replace: true }));
  const submit = () =>
    void vm.submit().then(
      (outcome) => {
        if (outcome.kind === 'sent') leave();
      },
      () => undefined,
    );
  return (
    <div data-testid="feedback.root" style={page}>
      <TopBar title={t('fdbk.title')} right={<CloseButton onClick={leave} testId="feedback.close-button" />} />
      <div style={body}>
        <p data-testid="feedback.guide-text" style={{ whiteSpace: 'pre-line', margin: 0, color: color.textPrimary, ...font('title3') }}>
          {t('fdbk.intro.title')}
        </p>
        <p data-testid="feedback.guide-body" style={{ whiteSpace: 'pre-line', margin: 0, color: color.textSecondary, ...font('body') }}>
          {t('fdbk.intro.body')}
        </p>
        <label htmlFor={inputId} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {t('fdbk.field.label')}
        </label>
        <div className="ck-field">
          <textarea
            id={inputId}
            data-testid="feedback.input"
            value={state.text}
            placeholder={t('fdbk.field.placeholder')}
            readOnly={state.submitting}
            aria-describedby={counterId}
            aria-invalid={state.count > FEEDBACK_MAX || undefined}
            rows={8}
            style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', background: 'transparent', resize: 'none', color: color.textPrimary, ...font('body') }}
            onChange={(event) => vm.setText(event.target.value)}
          />
          <div id={counterId} data-testid="feedback.counter" style={{ textAlign: 'right', color: color.textMuted, ...font('caption') }}>
            {state.count}/{FEEDBACK_MAX}
          </div>
        </div>
        {state.error === 'invalid' ? (
          <p data-testid="feedback.validation-message" role="alert" style={note}>
            {t('fdbk.error.invalid')}
          </p>
        ) : null}
        {state.error === 'network' || state.error === 'generic' ? (
          <p data-testid="feedback.error-message" role="alert" style={note}>
            {state.error === 'network' ? t('common.error.network') : t('fdbk.error.generic')}
          </p>
        ) : null}
        <Button fill data-testid="feedback.submit-button" disabled={!state.canSubmit} aria-busy={state.submitting || undefined} onClick={submit}>
          {state.submitting ? t('fdbk.sending') : t('fdbk.send')}
        </Button>
      </div>
    </div>
  );
}
