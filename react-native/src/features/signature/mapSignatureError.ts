import {
  AuthenticationRequiredError,
  CancelledError,
  HttpError,
  NetworkError,
  ReauthenticationRequiredError,
} from '../../core/http/ApiError';
import { t } from '../../shared/copy';
import { SignupPendingTimeoutError } from './SignatureSubmitter';

export type SignatureMode = 'onboarding' | 'change';

/** 실패를 사용자에게 어떻게 보일지. 분기는 errorCode·HTTP 상태·단계로만 한다(D-02, message 파싱 금지). */
export type SignatureFailure =
  /** 미리보기 오류 알림. backToDraw면 그리기 화면으로 돌아가 거기서 보인다(획은 유지). */
  | { kind: 'message'; message: string; backToDraw: boolean }
  /** 로그인 화면으로 보내고 토스트로 알린다(401 만료, 가입 403 차단). */
  | { kind: 'login'; message: string }
  /** 토스트만(변경 모드 403 정지 회원). */
  | { kind: 'toast'; message: string }
  /** 화면에 아무것도 보이지 않는다(취소됨). */
  | { kind: 'ignore' };

/** REQ-ONB-016/022~026, REQ-SIGN-024~028 및 두 문서의 오류 표. */
export function mapSignatureError(error: unknown, mode: SignatureMode): SignatureFailure {
  const onboarding = mode === 'onboarding';
  const generic = (): SignatureFailure =>
    message(t(onboarding ? 'onb.signup.error.generic' : 'sign.change.error.generic'));

  if (error instanceof CancelledError) return { kind: 'ignore' };
  if (error instanceof SignupPendingTimeoutError) return message(t('onb.signup.error.timeout'));
  if (
    error instanceof AuthenticationRequiredError ||
    error instanceof ReauthenticationRequiredError
  ) {
    return { kind: 'login', message: t('sign.error.expired') };
  }
  if (error instanceof NetworkError) return message(t('sign.error.network'));
  if (!(error instanceof HttpError)) return generic();

  switch (error.status) {
    case 401:
      return { kind: 'login', message: t('sign.error.expired') };
    case 403:
      // 가입: 차단된 소셜 계정이라 서버 message를 그대로 보이고 로그인으로(확인 필요 3). 변경: 정지 회원.
      if (!onboarding) return { kind: 'toast', message: t('auth.banned.signature') };
      return { kind: 'login', message: error.serverMessage ?? t('onb.signup.error.generic') };
    case 404:
      return message(t(onboarding ? 'onb.signup.error.reupload' : 'sign.change.error.not-found'));
    case 400:
      if (error.errorCode === 'SIGNATURE_REUPLOAD_REQUIRED') {
        return message(t('onb.signup.error.reupload'));
      }
      // 서버 message로 나누지 않는다(D-02): 사용할 수 없는 사인·사용된 토큰·탈퇴 회원 모두 같은 문구.
      if (error.errorCode === 'BUSINESS_ERROR') return message(t('sign.error.invalid'), true);
      return generic();
    default:
      return generic();
  }
}

function message(text: string, backToDraw = false): SignatureFailure {
  return { kind: 'message', message: text, backToDraw };
}
