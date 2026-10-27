import type { ReactNode } from 'react';

/**
 * 개발용 세션 주입 화면('/dev/session', 개발 플래그가 켜졌을 때만 라우트가 있다). testid 없이 role/label로 찾는다:
 * textbox "Refresh token", textbox "User ID", button "세션 주입", 실패는 role="alert". 성공하면 /home으로 replace.
 */
export function DevSessionScreen(): ReactNode {
  throw new Error('not implemented');
}
