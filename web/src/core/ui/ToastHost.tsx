import type { ReactNode } from 'react';
import { useViewModel } from '../state/useViewModel';
import type { ToastController } from './ToastController';

/** data-testid: 토스트가 있는 동안만 `toast.container`(안에 `toast.message`). 없으면 DOM에서 뺀다. */
export function ToastHost({ controller }: { controller: ToastController }): ReactNode {
  const { toast } = useViewModel(controller);
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      data-testid="toast.container"
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    >
      <span
        data-testid="toast.message"
        style={{ background: 'rgba(30, 30, 30, 0.92)', color: '#fff', padding: '12px 16px', borderRadius: 12, maxWidth: '100%' }}
      >
        {toast.message}
      </span>
    </div>
  );
}
