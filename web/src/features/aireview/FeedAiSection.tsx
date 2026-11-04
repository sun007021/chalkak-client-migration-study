import { useEffect, useId, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { t } from '../../copy/ko';
import { useViewModel } from '../../core/state/useViewModel';
import type { DateString } from '../../core/time/kst';
import { color, font, radius, space } from '../../design/tokens';
import { Button } from '../../core/ui/Button';
import { IcAperture } from '../../core/ui/icons.generated';
import { useDialogFocus } from '../../core/ui/useDialogFocus';
import type { AiReviewResult } from './aiReviewModels';
import { AiStartSheet } from './AiStartSheet';
import type { FeedAiViewModel } from './FeedAiViewModel';

/**
 * 상세 화면의 AI 영역: 알약 하나(상태 표)와 폴링 창 종료 안내, 시트(시작·결과·실패)를 그린다. 로직은 FeedAiViewModel에 있다.
 * 게시물 정보(isMine, topicDate)를 setPost로, 문서 가시성을 onShown/onHidden으로 ViewModel에 전달한다.
 */
export function FeedAiSection({ vm, isMine, topicDate }: { vm: FeedAiViewModel; isMine: boolean; topicDate: DateString | null }): ReactNode {
  const state = useViewModel(vm);
  useEffect(() => {
    vm.setPost({ isMine, topicDate });
  }, [vm, isMine, topicDate]);
  // 다른 탭·앱으로 가면 폴링을 멈추고 돌아오면 GET부터 다시 시작한다(REQ-AIR-028).
  useEffect(() => {
    const apply = () => {
      if (document.visibilityState === 'visible') void vm.onShown();
      else vm.onHidden();
    };
    apply();
    document.addEventListener('visibilitychange', apply);
    return () => {
      document.removeEventListener('visibilitychange', apply);
      vm.onHidden();
    };
  }, [vm]);

  const { sheet } = state;
  // 시트가 닫힌 뒤 원래 트리거(알약)가 사라졌으면(요청 → 분석중 등) 포커스가 body로 떨어지지 않게 알약 영역으로 옮긴다.
  const regionRef = useRef<HTMLDivElement | null>(null);
  const previousSheet = useRef(sheet.kind);
  useEffect(() => {
    const was = previousSheet.current;
    previousSheet.current = sheet.kind;
    if (was !== 'none' && sheet.kind === 'none' && (document.activeElement === document.body || document.activeElement === null)) regionRef.current?.focus();
  }, [sheet.kind]);
  return (
    <>
      <div ref={regionRef} role="status" tabIndex={-1} style={{ outline: 'none' }}>
        <Pill vm={vm} pill={state.pill} />
        {state.stalled ? (
          <p data-testid="feed.ai-message" style={{ margin: "4px 0", color: color.textSecondary, ...font("footnote") }}>
            {t('ai.poll.timeout')}
          </p>
        ) : null}
        {state.stalled ? (
          <button type="button" data-testid="feed.ai-recheck-button" onClick={() => void vm.onRecheckPress()}>
            {t('ai.pill.recheck')}
          </button>
        ) : null}
      </div>
      {sheet.kind === 'start' ? <AiStartSheet retry={sheet.retry} onConfirm={() => void vm.confirmStart()} onClose={() => vm.closeSheet()} /> : null}
      {sheet.kind === 'result' ? <ResultSheet vm={vm} result={sheet.result} criteriaOpen={state.criteriaOpen} /> : null}
      {sheet.kind === 'failed' ? <FailedSheet vm={vm} reason={sheet.reason} canRetry={sheet.canRetry} /> : null}
    </>
  );
}

// 상세의 AI 알약: 캡슐, 비활성(진행 중)은 옅게, 요청·결과는 actionPrimary.
const pillStyle = (variant: 'primary' | 'quiet'): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: space.sm,
  minHeight: 36,
  padding: `0 ${space.lg}`,
  border: variant === 'primary' ? 0 : `1px solid ${color.border}`,
  borderRadius: radius.pill,
  background: variant === 'primary' ? color.actionPrimary : color.surfaceElevated,
  color: variant === 'primary' ? color.onActionPrimary : color.textSecondary,
  ...font('footnote'),
  fontWeight: 600,
});

function Pill({ vm, pill }: { vm: FeedAiViewModel; pill: FeedAiViewModel['state']['pill'] }): ReactNode {
  const press = () => vm.onPillPress();
  const busy = (testId: string, label: string) => (
    <button type="button" data-testid={testId} disabled style={pillStyle('quiet')}>
      <span className="ck-wave-dots" aria-hidden="true" />
      {label}
    </button>
  );
  const action = (testId: string, label: string, variant: 'primary' | 'quiet' = 'primary') => (
    <button type="button" className="ck-press" data-testid={testId} style={pillStyle(variant)} onClick={press}>
      {label}
    </button>
  );
  switch (pill) {
    case 'hidden':
      return null;
    case 'checking':
      return busy('feed.ai-checking', t('ai.pill.checking'));
    case 'requesting':
      return busy('feed.ai-requesting', t('ai.pill.requesting'));
    case 'processing':
      return busy('feed.ai-processing', t('ai.pill.processing'));
    case 'request':
      return action('feed.ai-request-button', t('ai.pill.request'));
    case 'view':
      return action('feed.ai-result-button', t('ai.pill.view'));
    case 'retry':
      return action('feed.ai-retry-button', t('ai.pill.retry'), 'quiet');
    case 'failed':
      return action('feed.ai-failed-button', t('ai.pill.failed'), 'quiet');
    case 'recheck':
      return action('feed.ai-recheck-button', t('ai.pill.recheck'), 'quiet');
  }
}

const formatScore = (score: number): string => score.toFixed(1);

/** 점수 링(원본 HomeFeedbackCard): 84, stroke 8, 트랙 calendarCell, 진행 actionPrimary, round cap, -90°에서 시작(10점 만점). */
function ScoreRing({ score }: { score: number }): ReactNode {
  const r = 38;
  const c = 2 * Math.PI * r;
  const ratio = Math.max(0, Math.min(1, score / 10));
  return (
    <span style={{ position: 'relative', display: 'inline-flex', flex: 'none', width: 84, height: 84, alignItems: 'center', justifyContent: 'center' }}>
      <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        <circle cx="42" cy="42" r={r} fill="none" stroke="var(--color-calendar-cell)" strokeWidth="8" />
        <circle cx="42" cy="42" r={r} fill="none" stroke="var(--color-action-primary)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${c * ratio} ${c}`} />
      </svg>
      {/* 숫자는 점수 링 안(title1). 접근성 이름은 이 요소가 가진다. */}
      <span data-testid="ai-result-sheet.overall-score" role="img" aria-label={t('ai.result.score-a11y', { X: formatScore(score) })} style={{ position: 'relative', ...font('title1') }}>
        {formatScore(score)}
      </span>
    </span>
  );
}

const sectionTitle: CSSProperties = { margin: 0, ...font('footnote'), fontWeight: 600 };
const sectionBody: CSSProperties = { margin: `${space.xs} 0 0`, color: color.textSecondary, ...font('subheadline') };

function ResultSheet({ vm, result, criteriaOpen }: { vm: FeedAiViewModel; result: AiReviewResult; criteriaOpen: boolean }): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  // 기준 설명 다이얼로그가 위에 열려 있는 동안 Esc·Tab 처리는 그쪽만 한다(중첩 모달).
  useDialogFocus(ref, () => vm.closeSheet(), undefined, !criteriaOpen);
  const { feedback } = result;
  const divider = <hr style={{ margin: `${space.lg} 0`, border: 0, borderTop: `1px solid ${color.border}` }} />;
  return (
    <div className="ck-overlay ck-overlay--sheet" style={{ zIndex: 200 }}>
      <div ref={ref} data-testid="ai-result-sheet.root" role="dialog" aria-modal="true" aria-labelledby={titleId} className="ck-sheet" style={{ maxHeight: '90dvh', overflowY: 'auto' }}>
        <div className="ck-sheet__handle" aria-hidden="true" />
        {result.distinctivePerspective ? (
          <p
            data-testid="ai-result-sheet.distinctive-badge"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, margin: `0 0 ${space.md}`, padding: `${space.xs} ${space.sm}`, borderRadius: radius.small, background: color.actionPrimary, color: color.onActionPrimary, ...font('caption'), fontWeight: 600 }}
          >
            <IcAperture size={14} />
            {t('ai.result.perspective-badge')}
          </p>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.lg }}>
          <h2 id={titleId} data-testid="ai-result-sheet.feedback-summary" style={{ margin: 0, ...font('title3'), fontWeight: 700 }}>
            {feedback.summary}
          </h2>
          <ScoreRing score={result.overallScore} />
        </div>
        <ul style={{ listStyle: 'none', margin: `${space.lg} 0 0`, padding: 0, display: 'flex', flexDirection: 'column', gap: space.sm }}>
          {result.criteria.map((criterion, index) => (
            <li key={`${criterion.key}-${index}`} data-testid={`ai-result-sheet.criteria-item-${criterion.key}`} style={{ display: 'flex', justifyContent: 'space-between', color: color.textSecondary, ...font('subheadline') }}>
              <span>{criterion.label}</span>
              <span style={{ color: color.textPrimary, fontWeight: 600 }}>{formatScore(criterion.score)}</span>
            </li>
          ))}
        </ul>
        {divider}
        <section data-testid="ai-result-sheet.feedback-strength">
          <h3 style={sectionTitle}>{t('ai.result.strength')}</h3>
          <p style={sectionBody}>{feedback.strength}</p>
        </section>
        <section data-testid="ai-result-sheet.feedback-weakness" style={{ marginTop: space.md }}>
          <h3 style={sectionTitle}>{t('ai.result.weakness')}</h3>
          <p style={sectionBody}>{feedback.weakness}</p>
        </section>
        {divider}
        <section data-testid="ai-result-sheet.feedback-suggestion">
          <h3 style={sectionTitle}>{t('ai.result.suggestion')}</h3>
          <p style={sectionBody}>{feedback.suggestion}</p>
        </section>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="ck-link" data-testid="ai-result-sheet.criteria-info-button" style={{ ...font('caption'), color: color.textSecondary }} onClick={() => vm.openCriteria()}>
            {t('ai.result.criteria-help')}
          </button>
        </div>
        <div style={{ marginTop: space.md }}>
          <Button fill data-testid="ai-result-sheet.close-button" onClick={() => vm.closeSheet()}>
            {t('common.close')}
          </Button>
        </div>
      </div>
      {criteriaOpen ? <CriteriaDialog vm={vm} /> : null}
    </div>
  );
}

function CriteriaDialog({ vm }: { vm: FeedAiViewModel }): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  useDialogFocus(ref, () => vm.closeCriteria());
  return (
    <div className="ck-overlay" style={{ zIndex: 210 }}>
      <div ref={ref} data-testid="ai-result-sheet.criteria-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} className="ck-dialog">
        <h2 id={titleId} className="ck-dialog__title">
          {t('ai.result.criteria-dialog-title')}
        </h2>
        <div className="ck-dialog__actions">
          <Button data-testid="ai-result-sheet.criteria-close-button" onClick={() => vm.closeCriteria()}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FailedSheet({ vm, reason, canRetry }: { vm: FeedAiViewModel; reason: 'no-more' | 'past' | 'none'; canRetry: boolean }): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  useDialogFocus(ref, () => vm.closeSheet(), confirmRef);
  return (
    <div className="ck-overlay" style={{ zIndex: 200 }}>
      <div ref={ref} data-testid="ai-failed-sheet.root" role="dialog" aria-modal="true" aria-labelledby={titleId} className="ck-dialog">
        <h2 id={titleId} className="ck-dialog__title">
          {t('ai.failed.title')}
        </h2>
        {reason === 'none' ? null : (
          <p data-testid="ai-failed-sheet.message" className="ck-dialog__message">
            {reason === 'no-more' ? t('ai.failed.no-more') : t('ai.failed.past')}
          </p>
        )}
        <div className="ck-dialog__actions">
          {canRetry ? (
            <Button variant="outlined" data-testid="ai-failed-sheet.retry-button" onClick={() => vm.retryFromFailedSheet()}>
              {t('ai.pill.retry')}
            </Button>
          ) : null}
          <Button ref={confirmRef} data-testid="ai-failed-sheet.confirm-button" onClick={() => vm.closeSheet()}>
            {t('ai.failed.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
