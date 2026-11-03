import { useCallback, useId } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { ROUTES, isSettingsBelow } from '../../app/paths';
import { FEEDBACK_MAX } from '../../constants';
import { t } from '../../copy/ko';
import { useScreenView } from '../../core/analytics/useScreenView';
import { useOwnedViewModel } from '../../core/state/useOwnedViewModel';
import { useSubscribed } from '../../core/state/useSubscribed';
import { useViewModel } from '../../core/state/useViewModel';
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

const page: CSSProperties = { minHeight: '100dvh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16, padding: 16 };

function FeedbackView({ vm }: { vm: FeedbackViewModel }): ReactNode {
  const state = useViewModel(vm);
  const subscribed = useSubscribed();
  const navigate = useNavigate();
  const below = isSettingsBelow(useLocation());
  const inputId = useId();
  const leave = () => void (below ? navigate(-1) : navigate(ROUTES.settings, { replace: true }));
  const submit = () =>
    void vm.submit().then(
      (outcome) => {
        if (outcome.kind === 'sent') leave();
      },
      () => undefined,
    );
  if (!subscribed) return null;
  return (
    <div data-testid="feedback.root" style={page}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>{t('fdbk.title')}</h1>
        <button type="button" data-testid="feedback.close-button" aria-label={t('common.close')} style={{ minHeight: 44, minWidth: 44 }} onClick={leave}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <p data-testid="feedback.guide-text" style={{ whiteSpace: 'pre-line', margin: 0, fontWeight: 600 }}>
        {t('fdbk.intro.title')}
      </p>
      <p data-testid="feedback.guide-body" style={{ whiteSpace: 'pre-line', margin: 0 }}>
        {t('fdbk.intro.body')}
      </p>
      <label htmlFor={inputId} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {t('fdbk.field.label')}
      </label>
      <textarea
        id={inputId}
        data-testid="feedback.input"
        value={state.text}
        placeholder={t('fdbk.field.placeholder')}
        readOnly={state.submitting}
        rows={8}
        style={{ width: '100%', boxSizing: 'border-box', font: 'inherit' }}
        onChange={(event) => vm.setText(event.target.value)}
      />
      <div data-testid="feedback.counter" style={{ alignSelf: 'flex-end' }}>
        {state.count}/{FEEDBACK_MAX}
      </div>
      {state.error === 'invalid' ? (
        <p data-testid="feedback.validation-message" role="alert" style={{ margin: 0 }}>
          {t('fdbk.error.invalid')}
        </p>
      ) : null}
      {state.error === 'network' || state.error === 'generic' ? (
        <p data-testid="feedback.error-message" role="alert" style={{ margin: 0 }}>
          {state.error === 'network' ? t('common.error.network') : t('fdbk.error.generic')}
        </p>
      ) : null}
      <button type="button" data-testid="feedback.submit-button" disabled={!state.canSubmit} style={{ minHeight: 48 }} onClick={submit}>
        {state.submitting ? t('fdbk.sending') : t('fdbk.send')}
      </button>
    </div>
  );
}
