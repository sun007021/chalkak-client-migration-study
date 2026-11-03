import { useId, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { t } from '../../copy/ko';
import { useDialogFocus } from '../../core/ui/useDialogFocus';

const overlay: CSSProperties = { position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' };
const panel: CSSProperties = { width: 'min(90vw, 360px)', maxHeight: '90vh', overflowY: 'auto', padding: 16, borderRadius: 12, background: '#fff' };
const row: CSSProperties = { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 };

/**
 * AI 피드백 시작·재요청 시트(상세 알약과 홈 카드 공용, REQ-AIR-019, 052). "분석 시작하기"를 눌러야 요청하고 닫기는 요청 없이 닫는다.
 * 누르면 호출한 쪽이 시트를 닫으므로 요청 중 비활성 상태는 따로 두지 않는다.
 */
export function AiStartSheet({ retry, onConfirm, onClose }: { retry: boolean; onConfirm: () => void; onClose: () => void }): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  useDialogFocus(ref, onClose, startRef);
  return (
    <div style={overlay}>
      <div ref={ref} data-testid="ai-start-sheet.root" role="dialog" aria-modal="true" aria-labelledby={titleId} style={panel}>
        <h2 id={titleId} style={{ margin: '0 0 8px', fontSize: 16 }}>
          {retry ? t('ai.start.title-retry') : t('ai.start.title')}
        </h2>
        <div data-testid="ai-start-sheet.description">
          <p style={{ margin: '4px 0' }}>{t('ai.start.line1')}</p>
          <p style={{ margin: '4px 0' }}>{t('ai.start.line2')}</p>
          <p style={{ margin: '4px 0' }}>{t('ai.start.line3')}</p>
        </div>
        <div style={row}>
          <button type="button" data-testid="ai-start-sheet.close-button" onClick={onClose}>
            {t('common.close')}
          </button>
          <button ref={startRef} type="button" data-testid="ai-start-sheet.start-button" onClick={onConfirm}>
            {t('ai.start.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
