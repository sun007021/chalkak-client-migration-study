import { useEffect, useId, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { t } from '../../copy/ko';
import { useViewModel } from '../../core/state/useViewModel';
import type { DateString } from '../../core/time/kst';
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
          <p data-testid="feed.ai-message" style={{ margin: '4px 0' }}>
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

function Pill({ vm, pill }: { vm: FeedAiViewModel; pill: FeedAiViewModel['state']['pill'] }): ReactNode {
  const press = () => vm.onPillPress();
  switch (pill) {
    case 'hidden':
      return null;
    case 'checking':
      return (
        <button type="button" data-testid="feed.ai-checking" disabled>
          {t('ai.pill.checking')}
        </button>
      );
    case 'requesting':
      return (
        <button type="button" data-testid="feed.ai-requesting" disabled>
          {t('ai.pill.requesting')}
        </button>
      );
    case 'processing':
      return (
        <button type="button" data-testid="feed.ai-processing" disabled>
          {t('ai.pill.processing')}
        </button>
      );
    case 'request':
      return (
        <button type="button" data-testid="feed.ai-request-button" onClick={press}>
          {t('ai.pill.request')}
        </button>
      );
    case 'view':
      return (
        <button type="button" data-testid="feed.ai-result-button" onClick={press}>
          {t('ai.pill.view')}
        </button>
      );
    case 'retry':
      return (
        <button type="button" data-testid="feed.ai-retry-button" onClick={press}>
          {t('ai.pill.retry')}
        </button>
      );
    case 'failed':
      return (
        <button type="button" data-testid="feed.ai-failed-button" onClick={press}>
          {t('ai.pill.failed')}
        </button>
      );
    case 'recheck':
      return (
        <button type="button" data-testid="feed.ai-recheck-button" onClick={press}>
          {t('ai.pill.recheck')}
        </button>
      );
  }
}

const overlay: CSSProperties = { position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' };
const panel: CSSProperties = { width: 'min(90vw, 360px)', maxHeight: '90vh', overflowY: 'auto', padding: 16, borderRadius: 12, background: '#fff' };
const row: CSSProperties = { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 };

const formatScore = (score: number): string => score.toFixed(1);

function ResultSheet({ vm, result, criteriaOpen }: { vm: FeedAiViewModel; result: AiReviewResult; criteriaOpen: boolean }): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  // 기준 설명 다이얼로그가 위에 열려 있는 동안 Esc·Tab 처리는 그쪽만 한다(중첩 모달).
  useDialogFocus(ref, () => vm.closeSheet(), undefined, !criteriaOpen);
  const { feedback } = result;
  return (
    <div style={overlay}>
      <div ref={ref} data-testid="ai-result-sheet.root" role="dialog" aria-modal="true" aria-labelledby={titleId} style={panel}>
        <h2 id={titleId} data-testid="ai-result-sheet.feedback-summary" style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>
          {feedback.summary}
        </h2>
        <p data-testid="ai-result-sheet.overall-score" role="img" aria-label={t('ai.result.score-a11y', { X: formatScore(result.overallScore) })} style={{ margin: '4px 0', fontSize: 28, fontWeight: 700 }}>
          {formatScore(result.overallScore)}
        </p>
        {result.distinctivePerspective ? <p data-testid="ai-result-sheet.distinctive-badge">{t('ai.result.perspective-badge')}</p> : null}
        <ul style={{ listStyle: 'none', margin: '8px 0', padding: 0 }}>
          {result.criteria.map((criterion, index) => (
            <li key={`${criterion.key}-${index}`} data-testid={`ai-result-sheet.criteria-item-${criterion.key}`} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{criterion.label}</span>
              <span>{formatScore(criterion.score)}</span>
            </li>
          ))}
        </ul>
        <button type="button" data-testid="ai-result-sheet.criteria-info-button" onClick={() => vm.openCriteria()}>
          {t('ai.result.criteria-help')}
        </button>
        <section data-testid="ai-result-sheet.feedback-strength">
          <h3 style={{ margin: '12px 0 4px', fontSize: 14 }}>{t('ai.result.strength')}</h3>
          <p style={{ margin: 0 }}>{feedback.strength}</p>
        </section>
        <section data-testid="ai-result-sheet.feedback-weakness">
          <h3 style={{ margin: '12px 0 4px', fontSize: 14 }}>{t('ai.result.weakness')}</h3>
          <p style={{ margin: 0 }}>{feedback.weakness}</p>
        </section>
        <section data-testid="ai-result-sheet.feedback-suggestion">
          <h3 style={{ margin: '12px 0 4px', fontSize: 14 }}>{t('ai.result.suggestion')}</h3>
          <p style={{ margin: 0 }}>{feedback.suggestion}</p>
        </section>
        <div style={row}>
          <button type="button" data-testid="ai-result-sheet.close-button" onClick={() => vm.closeSheet()}>
            {t('common.close')}
          </button>
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
    <div style={{ ...overlay, zIndex: 210 }}>
      <div ref={ref} data-testid="ai-result-sheet.criteria-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} style={panel}>
        <h2 id={titleId} style={{ margin: '0 0 8px', fontSize: 16 }}>
          {t('ai.result.criteria-dialog-title')}
        </h2>
        <div style={row}>
          <button type="button" data-testid="ai-result-sheet.criteria-close-button" onClick={() => vm.closeCriteria()}>
            {t('common.close')}
          </button>
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
    <div style={overlay}>
      <div ref={ref} data-testid="ai-failed-sheet.root" role="dialog" aria-modal="true" aria-labelledby={titleId} style={panel}>
        <h2 id={titleId} style={{ margin: '0 0 8px', fontSize: 16 }}>
          {t('ai.failed.title')}
        </h2>
        {reason === 'none' ? null : (
          <p data-testid="ai-failed-sheet.message" style={{ margin: '4px 0' }}>
            {reason === 'no-more' ? t('ai.failed.no-more') : t('ai.failed.past')}
          </p>
        )}
        <div style={row}>
          {canRetry ? (
            <button type="button" data-testid="ai-failed-sheet.retry-button" onClick={() => vm.retryFromFailedSheet()}>
              {t('ai.pill.retry')}
            </button>
          ) : null}
          <button ref={confirmRef} type="button" data-testid="ai-failed-sheet.confirm-button" onClick={() => vm.closeSheet()}>
            {t('ai.failed.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
