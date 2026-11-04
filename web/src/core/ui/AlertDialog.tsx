import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';

/**
 * 확인 버튼 하나짜리 알림. 열리면 확인 버튼으로 포커스가 가고, 닫히면(언마운트) 열기 전에 포커스가 있던 요소로 돌아간다.
 * 제목 없이 메시지만 보인다(aria-labelledby = 메시지). testid는 `<testId>`, `<testId>-confirm-button`.
 * jsdom은 <dialog>.showModal()을 지원하지 않아 role="alertdialog" + 포커스 관리로 만든다.
 */
export function AlertDialog({ testId, message, confirmLabel, onConfirm }: { testId: string; message: string; confirmLabel: string; onConfirm: () => void }): ReactNode {
  const messageId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmRef.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div className="ck-overlay" style={{ zIndex: 200 }}>
      <div data-testid={testId} role="alertdialog" aria-modal="true" aria-labelledby={messageId} className="ck-dialog">
        <p id={messageId} className="ck-dialog__message" style={{ marginTop: 0, color: 'var(--color-text-primary)' }}>
          {message}
        </p>
        <div className="ck-dialog__actions">
          <Button ref={confirmRef} data-testid={`${testId}-confirm-button`} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
