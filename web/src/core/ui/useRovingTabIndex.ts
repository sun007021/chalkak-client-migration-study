import { useCallback } from 'react';
import type { KeyboardEvent } from 'react';

/**
 * role="tab" / role="radio" 묶음의 방향키 이동(WAI-ARIA roving tabindex). 묶음 요소의 onKeyDown에 꽂고, 항목은 선택된 것만 tabIndex=0, 나머지는 -1로 둔다.
 * ←/→(radio는 ↑/↓도)는 이웃 항목으로 초점을 옮기고 끝에서 처음으로 돌아가며, Home/End는 처음/끝이다.
 * option(세로 목록)은 ↑/↓로 이동하고 초점만 옮긴다(선택은 Enter/Space/클릭).
 * radio는 초점이 옮겨 가면 선택도 함께 옮긴다(클릭). tab은 초점만 옮기고 선택은 Enter/Space(클릭)가 한다.
 */
export function useRovingTabIndex(role: 'tab' | 'radio' | 'option'): (event: KeyboardEvent<HTMLElement>) => void {
  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(`[role="${role}"]`)).filter((el) => !el.hasAttribute('disabled'));
      const current = items.findIndex((el) => el === event.target || el.contains(event.target as Node));
      if (current < 0 || items.length === 0) return;
      const forward = role === 'radio' ? ['ArrowRight', 'ArrowDown'] : role === 'option' ? ['ArrowDown'] : ['ArrowRight'];
      const backward = role === 'radio' ? ['ArrowLeft', 'ArrowUp'] : role === 'option' ? ['ArrowUp'] : ['ArrowLeft'];
      let next: number;
      if (forward.includes(event.key)) next = (current + 1) % items.length;
      else if (backward.includes(event.key)) next = (current - 1 + items.length) % items.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = items.length - 1;
      else return;
      event.preventDefault();
      const target = items[next]!;
      target.focus();
      if (role === 'radio' && target !== items[current]) target.click();
    },
    [role],
  );
}
