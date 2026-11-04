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
      className="ck-toast"
      // 원본 ChalkakToast: 하단 바 위(바 높이 + 32). 위치·터치 통과는 인라인으로 둬 CSS 로드와 무관하게 지킨다.
      style={{ bottom: 'calc(var(--bottom-bar-height, 0px) + 32px)', pointerEvents: 'none', zIndex: 1000 }}
    >
      <span data-testid="toast.message" className="ck-toast__message">
        {toast.message}
      </span>
    </div>
  );
}
