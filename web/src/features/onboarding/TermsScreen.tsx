import type { ReactNode } from 'react';

/**
 * 약관 화면(/signup/terms). data-testid: terms.root, terms.title, terms.agree-all-checkbox, terms.service-checkbox, terms.privacy-checkbox
 * (role="checkbox" + aria-checked), terms.service-view-button, terms.privacy-view-button, terms.next-button(canProceed 전 disabled), terms.back-button,
 * 열기 실패 시 legal-doc.open-failed-message. SignupDraft가 없으면(새로고침 등) /login으로 replace하고 화면을 그리지 않는다. screen_view 'terms'는 전역 경로 추적이 보낸다.
 */
export function TermsScreen(): ReactNode {
  return <div />;
}
