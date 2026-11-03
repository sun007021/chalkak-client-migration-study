import { useId, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { t } from '../../copy/ko';
import { useDialogFocus } from './useDialogFocus';

const overlay: CSSProperties = { position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', padding: 16 };
const sheet: CSSProperties = { background: 'var(--color-surface, #fff)', color: 'inherit', borderRadius: 12, padding: 16, maxWidth: 360, width: '100%' };

export interface ConfirmDialogProps {
  message: string;
  confirmLabel: string;
  /** 처리 중: 확인 비활성, 취소·Esc 무시. */
  busy?: boolean;
  /** 되돌릴 수 없는 동작의 확인 버튼에 data-emphasis="destructive". */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** testid는 `<prefix>-dialog`, `<prefix>-confirm-button`, `<prefix>-cancel-button`. */
  testIdPrefix: string;
}

/**
 * 확인/취소 대화상자(role="alertdialog", 제목은 확인 문구). 처음 포커스는 되돌릴 수 없는 확인이 아니라 취소에 둔다.
 * 하단 바(zIndex 100) 위에 보이도록 zIndex 200. 처리 중에는 Esc·취소를 무시하고 취소 버튼은 포커스를 잃지 않게 aria-disabled로 둔다.
 */
export function ConfirmDialog({ message, confirmLabel, busy = false, destructive = false, onConfirm, onCancel, testIdPrefix }: ConfirmDialogProps): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const messageId = useId();
  useDialogFocus(ref, busy ? undefined : onCancel, cancelRef);
  return (
    <div style={overlay}>
      <div ref={ref} data-testid={`${testIdPrefix}-dialog`} role="alertdialog" aria-modal="true" aria-labelledby={messageId} aria-busy={busy || undefined} style={sheet}>
        <p id={messageId} style={{ marginTop: 0 }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button ref={cancelRef} type="button" data-testid={`${testIdPrefix}-cancel-button`} aria-disabled={busy || undefined} style={{ minHeight: 44 }} onClick={() => (busy ? undefined : onCancel())}>
            {t('auth.confirm.cancel')}
          </button>
          <button type="button" data-testid={`${testIdPrefix}-confirm-button`} data-emphasis={destructive ? 'destructive' : undefined} disabled={busy} style={{ minHeight: 44 }} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
