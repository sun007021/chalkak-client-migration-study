import { ROUTES } from '../../app/paths';
import type { SignatureMode } from './SignatureMode';
import type { SignaturePreviewOutcome } from './SignaturePreviewViewModel';

/** 이동 계획. back은 history에서 steps만큼 뒤로(POP), replace는 현재 항목을 바꾼다. 이동 없음이면 null. */
export type SignatureNavPlan = { kind: 'back'; steps: 1 | 2 } | { kind: 'replace'; to: string };

const drawPath = (mode: SignatureMode): string => (mode === 'onboarding' ? ROUTES.signupSignature : ROUTES.changeSignature);

/**
 * 미리보기 결과 뒤의 이동(순수 함수). below는 "설정이 바로 아래에 쌓여 있다"(설정에서 push로 들어온 변경 흐름)일 때만 true다.
 * 변경 모드: 성공은 below면 2칸 뒤로(미리보기·그리기를 걷어 내고 설정으로), 아니면 설정으로 replace. 그리기로 돌아갈 때는 below면 1칸 뒤로(그리기 항목 재사용), 아니면 그리기로 replace.
 * 가입 모드는 항상 replace(가드가 폐기된 가입 컨텍스트로 뒤로 가기를 막는다).
 */
export function planAfterOutcome(mode: SignatureMode, outcome: SignaturePreviewOutcome, below: boolean): SignatureNavPlan | null {
  switch (outcome.kind) {
    case 'home':
      return { kind: 'replace', to: ROUTES.home };
    case 'settings':
      return below ? { kind: 'back', steps: 2 } : { kind: 'replace', to: ROUTES.settings };
    case 'draw':
      return mode === 'change' && below ? { kind: 'back', steps: 1 } : { kind: 'replace', to: drawPath(mode) };
    case 'login':
      return { kind: 'replace', to: ROUTES.login };
    default:
      return null;
  }
}

/** 그리기 화면의 뒤로 버튼. 가입은 약관으로 replace, 변경은 below면 1칸 뒤로, 아니면 설정으로 replace. */
export function planDrawBack(mode: SignatureMode, below: boolean): SignatureNavPlan {
  if (mode === 'onboarding') return { kind: 'replace', to: ROUTES.terms };
  return below ? { kind: 'back', steps: 1 } : { kind: 'replace', to: ROUTES.settings };
}
