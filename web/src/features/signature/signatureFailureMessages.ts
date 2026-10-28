import { t } from '../../copy/ko';
import type { SignatureMode } from './SignatureMode';
import type { SignatureFailure } from './SignatureSubmitter';

/**
 * 실패 → 사용자 문구(copy 키의 t() 결과).
 * 공통: network → sign.error.network, expired → sign.error.expired, invalid → sign.error.invalid, reupload → onb.signup.error.reupload.
 * 가입: generic → onb.signup.error.generic, timeout → onb.signup.error.timeout, forbidden → 서버 message(없으면 generic), not_found → generic.
 * 변경: generic → sign.change.error.generic, not_found → sign.change.error.not-found, forbidden → auth.banned.signature, timeout → generic.
 */
export function signatureFailureMessage(mode: SignatureMode, failure: SignatureFailure): string {
  switch (failure.kind) {
    case 'network':
      return t('sign.error.network');
    case 'expired':
      return t('sign.error.expired');
    case 'invalid':
      return t('sign.error.invalid');
    case 'reupload':
      return t('onb.signup.error.reupload');
    case 'timeout':
      return mode === 'onboarding' ? t('onb.signup.error.timeout') : t('sign.change.error.generic');
    case 'forbidden':
      if (mode === 'change') return t('auth.banned.signature');
      return failure.serverMessage ? failure.serverMessage : t('onb.signup.error.generic');
    case 'not_found':
      return mode === 'change' ? t('sign.change.error.not-found') : t('onb.signup.error.generic');
    case 'generic':
      return mode === 'onboarding' ? t('onb.signup.error.generic') : t('sign.change.error.generic');
  }
}
