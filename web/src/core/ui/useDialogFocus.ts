import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const focusables = (root: HTMLElement): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('disabled'));

/** 다이얼로그 밖의 형제 요소를 inert로 만든다(배경 클릭·포커스·읽기 차단). 알림(aria-live) 영역은 남겨 토스트가 읽히게 한다. 되돌리는 함수를 돌려준다. */
export function inertBackground(dialog: HTMLElement): () => void {
  const changed: HTMLElement[] = [];
  let node: HTMLElement | null = dialog;
  while (node && node !== document.body) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node || !(sibling instanceof HTMLElement) || sibling.hasAttribute('inert')) continue;
      if (sibling.matches('[aria-live], script, style') || sibling.querySelector('[aria-live]')) continue;
      sibling.setAttribute('inert', '');
      changed.push(sibling);
    }
    node = parent;
  }
  return () => {
    for (const el of changed) el.removeAttribute('inert');
  };
}

/**
 * 모달 다이얼로그의 키보드·포커스 규칙(WAI-ARIA dialog): 열리면 initialFocus(없으면 첫 포커스 가능 요소)로 포커스를 옮기고,
 * Tab/Shift+Tab은 다이얼로그 안에서만 돌며, Esc는 onClose, 배경은 inert, 닫히면(언마운트) 열기 전 포커스(트리거)로 돌아간다.
 * onClose가 undefined이면 Esc는 아무것도 하지 않는다(처리 중 닫기 금지 등).
 */
export function useDialogFocus(dialogRef: RefObject<HTMLElement | null>, options: { onClose?: () => void; initialFocus?: RefObject<HTMLElement | null> } = {}): void {
  const closeRef = useRef(options.onClose);
  useEffect(() => {
    closeRef.current = options.onClose;
  }, [options.onClose]);
  const initialRef = options.initialFocus;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const restoreBackground = inertBackground(dialog);
    (initialRef?.current ?? focusables(dialog)[0] ?? dialog).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables(dialog);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      restoreBackground();
      if (previous?.isConnected) previous.focus();
    };
  }, [dialogRef, initialRef]);
}
