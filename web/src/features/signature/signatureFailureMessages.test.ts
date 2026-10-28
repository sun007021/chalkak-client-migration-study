import { t } from '../../copy/ko';
import { signatureFailureMessage } from './signatureFailureMessages';
import type { SignatureFailureKind } from './SignatureSubmitter';

const msg = (mode: 'onboarding' | 'change', kind: SignatureFailureKind, serverMessage?: string) => signatureFailureMessage(mode, { kind, serverMessage });

describe('signatureFailureMessage', () => {
  it('TC-ONB-041 TC-SIGN-034 네트워크 문구는 두 모드 모두 "네트워크 연결을 확인해 주세요."이다', () => {
    expect(msg('onboarding', 'network')).toBe(t('sign.error.network'));
    expect(msg('change', 'network')).toBe(t('sign.error.network'));
    expect(msg('change', 'network')).toBe('네트워크 연결을 확인해 주세요.');
  });

  it('TC-ONB-030 TC-ONB-033 만료는 "로그인 정보가 만료되었어요. 다시 로그인해 주세요."이다', () => {
    expect(msg('onboarding', 'expired')).toBe(t('sign.error.expired'));
    expect(msg('change', 'expired')).toBe(t('sign.error.expired'));
  });

  it('TC-ONB-035 TC-SIGN-029 서버가 사인을 거절하면 "사용할 수 없는 사인이에요. 다시 그려주세요."이다', () => {
    expect(msg('onboarding', 'invalid')).toBe(t('sign.error.invalid'));
    expect(msg('change', 'invalid')).toBe(t('sign.error.invalid'));
  });

  it('TC-ONB-036 TC-SIGN-028 다시 업로드가 필요하면 "사인을 다시 업로드해 주세요."이다', () => {
    expect(msg('onboarding', 'reupload')).toBe(t('onb.signup.error.reupload'));
    expect(msg('change', 'reupload')).toBe('사인을 다시 업로드해 주세요.');
  });

  it('TC-ONB-028 가입의 PENDING 소진은 "사인 처리에 시간이 걸리고 있어요. 다시 시도해 주세요."이다', () => {
    expect(msg('onboarding', 'timeout')).toBe(t('onb.signup.error.timeout'));
  });

  it('TC-ONB-034 TC-ONB-042 가입의 일반 실패는 "회원가입을 완료하지 못했어요. 다시 시도해 주세요."이다', () => {
    expect(msg('onboarding', 'generic')).toBe(t('onb.signup.error.generic'));
    expect(msg('onboarding', 'not_found')).toBe(t('onb.signup.error.generic'));
  });

  it('TC-ONB-032 TC-ONB-037 가입의 차단(403)은 서버 message를 그대로 보이고, 없으면 일반 실패 문구다(D-02: 문구만 표시용)', () => {
    expect(msg('onboarding', 'forbidden', '차단된 소셜 계정입니다.')).toBe('차단된 소셜 계정입니다.');
    expect(msg('onboarding', 'forbidden')).toBe(t('onb.signup.error.generic'));
  });

  it('TC-SIGN-030 TC-SIGN-031 변경의 차단(403)은 서버 message가 아니라 "이용이 제한되어 사인을 변경할 수 없어요."이다(D-08)', () => {
    expect(msg('change', 'forbidden', '차단된 회원입니다.')).toBe(t('auth.banned.signature'));
    expect(msg('change', 'forbidden')).toBe('이용이 제한되어 사인을 변경할 수 없어요.');
  });

  it('TC-SIGN-023 TC-SIGN-035 변경의 일반 실패는 "사인을 저장하지 못했어요. 다시 시도해 주세요."이다', () => {
    expect(msg('change', 'generic')).toBe(t('sign.change.error.generic'));
    expect(msg('change', 'timeout')).toBe(t('sign.change.error.generic'));
  });

  it('TC-SIGN-032 변경 PUT 404는 "사인 업로드를 찾을 수 없어요. 다시 시도해 주세요."이다', () => {
    expect(msg('change', 'not_found')).toBe(t('sign.change.error.not-found'));
  });
});
