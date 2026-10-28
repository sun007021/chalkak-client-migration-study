import type { ReactNode } from 'react';
import type { SignatureMode } from './SignatureMode';

/**
 * 사인 미리보기 화면(onboarding: /signup/signature/preview, change: /settings/signature/preview). data-testid: signature-preview.root(data-mode), signature-preview.title,
 * signature-preview.image(PNG를 사진 같은 배경 위에 얹어 표시, src는 blob URL이며 언마운트에서 revoke), signature-preview.redraw-button,
 * signature-preview.confirm-button(가입 "시작하기" / 변경 "사인 변경하기", busy면 disabled), signature-preview.change-notice(변경 모드만), signature-preview.loading(busy 동안).
 * SignatureDraft에 PNG가 없으면 해당 모드의 그리기 경로로 replace. screen_view는 onboarding_signature_preview / change_signature_preview.
 * 결과: home → /home(replace), settings → /settings(replace), draw → 그리기 경로(replace), login → /login(replace).
 */
export function SignaturePreviewScreen(_props: { mode: SignatureMode }): ReactNode {
  return <div />;
}
