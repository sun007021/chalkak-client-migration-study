import type { SignatureMode } from './SignatureMode';
import type { SignatureFailure } from './SignatureSubmitter';

/**
 * 실패 → 사용자 문구(copy 키의 t() 결과).
 * 공통: network → sign.error.network, expired → sign.error.expired, invalid → sign.error.invalid, reupload → onb.signup.error.reupload.
 * 가입: generic → onb.signup.error.generic, timeout → onb.signup.error.timeout, forbidden → 서버 message(없으면 generic), not_found → generic.
 * 변경: generic → sign.change.error.generic, not_found → sign.change.error.not-found, forbidden → auth.banned.signature, timeout → generic.
 */
export function signatureFailureMessage(_mode: SignatureMode, _failure: SignatureFailure): string {
  throw new Error('not implemented');
}
