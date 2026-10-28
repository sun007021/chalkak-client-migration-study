import { ROUTES } from '../../app/paths';
import { planAfterOutcome, planDrawBack } from './signatureNavigation';

describe('planAfterOutcome', () => {
  it('변경 성공: 설정이 아래에 있으면 2칸 뒤로, 아니면 설정으로 replace', () => {
    expect(planAfterOutcome('change', { kind: 'settings' }, true)).toEqual({ kind: 'back', steps: 2 });
    expect(planAfterOutcome('change', { kind: 'settings' }, false)).toEqual({ kind: 'replace', to: ROUTES.settings });
  });
  it('변경 draw: below면 1칸 뒤로, 아니면 그리기로 replace', () => {
    expect(planAfterOutcome('change', { kind: 'draw' }, true)).toEqual({ kind: 'back', steps: 1 });
    expect(planAfterOutcome('change', { kind: 'draw' }, false)).toEqual({ kind: 'replace', to: ROUTES.changeSignature });
  });
  it('가입은 below와 무관하게 replace', () => {
    expect(planAfterOutcome('onboarding', { kind: 'draw' }, true)).toEqual({ kind: 'replace', to: ROUTES.signupSignature });
    expect(planAfterOutcome('onboarding', { kind: 'home' }, true)).toEqual({ kind: 'replace', to: ROUTES.home });
  });
  it('login은 replace, stay·cancelled는 이동 없음', () => {
    expect(planAfterOutcome('change', { kind: 'login' }, true)).toEqual({ kind: 'replace', to: ROUTES.login });
    expect(planAfterOutcome('change', { kind: 'stay' }, true)).toBeNull();
    expect(planAfterOutcome('change', { kind: 'cancelled' }, true)).toBeNull();
  });
});

describe('planDrawBack', () => {
  it('가입은 약관으로 replace', () => {
    expect(planDrawBack('onboarding', true)).toEqual({ kind: 'replace', to: ROUTES.terms });
  });
  it('변경은 below면 1칸 뒤로, 아니면 설정으로 replace', () => {
    expect(planDrawBack('change', true)).toEqual({ kind: 'back', steps: 1 });
    expect(planDrawBack('change', false)).toEqual({ kind: 'replace', to: ROUTES.settings });
  });
});
