import { useRef } from 'react';
import type { ReactNode } from 'react';
import { useDialogFocus } from './useDialogFocus';

/**
 * 하단 시트(원본 .sheet / ModalBottomSheet): 위쪽 모서리 라운드 28, surfaceElevated, 손잡이, 뒤는 scrim 40%.
 * 컬럼 폭 안에 붙고, 하단 바(zIndex 100) 위(200)에 뜬다. Esc·바깥 터치는 onDismiss. 속성은 role="dialog"에 붙는다.
 */
export function Sheet({ children, onDismiss, label, testId }: { children: ReactNode; onDismiss: () => void; label?: string; testId?: string }): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  useDialogFocus(ref, onDismiss);
  return (
    <div className="ck-overlay ck-overlay--sheet" style={{ zIndex: 200 }} onClick={(event) => event.target === event.currentTarget && onDismiss()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} data-testid={testId} className="ck-sheet">
        <div className="ck-sheet__handle" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
