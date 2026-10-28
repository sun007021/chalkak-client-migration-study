import type { ReactNode } from 'react';
import type { SignatureMode } from './SignatureMode';

/**
 * 사인 그리기 화면(onboarding: /signup/signature, change: /settings/signature). data-testid: signature.root(data-mode), signature.title, signature.guide-text,
 * signature.canvas(포인터 이벤트 대상, 논리 크기 1024×512), signature.canvas-hint(획이 없을 때만), signature.undo-button, signature.clear-button,
 * signature.submit-button(사인이 없거나 busy면 disabled), signature.back-button, signature.error-message(오류가 있을 때만).
 * 포인터: pointerdown → 획 시작(clientToPad), 버튼이 눌린 pointermove → 점 추가, pointerup·pointercancel → 점을 더하지 않고 획만 끝낸다. 누르지 않은 hover는 무시. 뒤로 버튼: 가입은 /signup/terms, 변경은 /settings로 replace.
 * 가입 모드에서 SignupDraft가 없으면 /login으로 replace(그리지 않음). 마운트마다 새 ViewModel·빈 패드. screen_view는 onboarding_signature / change_signature를 useScreenView로.
 */
export function SignatureDrawScreen(_props: { mode: SignatureMode }): ReactNode {
  return <div />;
}
