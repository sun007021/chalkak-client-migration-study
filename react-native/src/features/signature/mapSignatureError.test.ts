import {
  AuthenticationRequiredError,
  CancelledError,
  HttpError,
  InvalidResponseError,
  NetworkError,
  ReauthenticationRequiredError,
  TimeoutError,
  parseErrorBody,
} from '../../core/http/ApiError';
import { fixtureBody, loadFixture } from '../../core/http/__testing__/loadFixture';
import { t } from '../../shared/copy';
import { mapSignatureError } from './mapSignatureError';
import {
  AlreadyRegisteredUnresolvedError,
  SignatureUploadError,
  SignupPendingTimeoutError,
} from './SignatureSubmitter';

/** fixture 본문과 상태 코드로 실제 ApiClient가 던지는 것과 같은 HttpError를 만든다. */
const httpError = (status: number, fixture: string): HttpError =>
  parseErrorBody(status, JSON.stringify(loadFixture(fixture)));

describe('mapSignatureError: 가입(onboarding)', () => {
  const map = (e: unknown) => mapSignatureError(e, 'onboarding');

  it('TC-ONB-028 PENDING 소진은 onb.signup.error.timeout 알림이고 그리기로 돌아가지 않는다', () => {
    expect(map(new SignupPendingTimeoutError())).toEqual({
      kind: 'message',
      message: t('onb.signup.error.timeout'),
      backToDraw: false,
    });
  });

  it('TC-ONB-030 TC-ONB-033 401은 로그인으로 보내고 sign.error.expired를 알린다(만료·갱신 실패 어느 형태든)', () => {
    const expected = { kind: 'login', message: t('sign.error.expired') };
    expect(map(httpError(401, 'onboarding/signup__unauthorized'))).toEqual(expected);
    expect(map(httpError(401, 'onboarding/signup-uploads__unauthorized'))).toEqual(expected);
    expect(map(new AuthenticationRequiredError('x'))).toEqual(expected);
    expect(map(new ReauthenticationRequiredError('x'))).toEqual(expected);
  });

  it('TC-ONB-032 TC-ONB-037 403은 서버 message 그대로 보여 주고 로그인으로 보낸다(차단 계정) [임시: 확인 필요 3]', () => {
    for (const fixture of [
      'onboarding/signup-uploads__forbidden-banned',
      'onboarding/signup__forbidden-banned',
    ]) {
      const body = fixtureBody<{ message: string }>(fixture);
      expect(map(httpError(403, fixture))).toEqual({ kind: 'login', message: body.message });
    }
  });

  it('TC-ONB-034 TC-ONB-035 TC-ONB-039 가입 확정의 400 BUSINESS_ERROR는 message와 무관하게 sign.error.invalid + 그리기로 [확인 필요 5: 카탈로그 034/039와 충돌, 보고서 참고]', () => {
    for (const fixture of [
      'onboarding/signup__already-used-token',
      'onboarding/signup__invalid-signature',
      'onboarding/signup__already-registered-withdrawn',
    ]) {
      expect(map(httpError(400, fixture))).toEqual({
        kind: 'message',
        message: t('sign.error.invalid'),
        backToDraw: true,
      });
    }
  });

  it('TC-ONB-036 404는 onb.signup.error.reupload', () => {
    expect(map(httpError(404, 'onboarding/signup__upload-not-found'))).toEqual({
      kind: 'message',
      message: t('onb.signup.error.reupload'),
      backToDraw: false, // 같은 PNG를 새 uploads부터 다시 보내면 되므로 미리보기에 머문다
    });
  });

  it('TC-ONB-040 presigned PUT 실패(SignatureUploadError)는 일반 실패 문구이고 그리기로 돌아가지 않는다', () => {
    expect(
      map(new SignatureUploadError(httpError(403, 'onboarding/presigned-put__expired'))),
    ).toEqual({
      kind: 'message',
      message: t('onb.signup.error.generic'),
      backToDraw: false,
    });
  });

  it('TC-ONB-041 연결 실패·타임아웃은 sign.error.network', () => {
    for (const e of [new NetworkError('offline'), new TimeoutError('timeout')]) {
      expect(map(e)).toEqual({
        kind: 'message',
        message: t('sign.error.network'),
        backToDraw: false,
      });
    }
  });

  it('TC-ONB-042 500·해석 불가·알 수 없는 오류는 onb.signup.error.generic', () => {
    const generic = { kind: 'message', message: t('onb.signup.error.generic'), backToDraw: false };
    expect(map(httpError(500, 'common/error__internal-500'))).toEqual(generic);
    expect(map(new InvalidResponseError('bad'))).toEqual(generic);
    expect(map(new Error('???'))).toEqual(generic);
  });

  it('TC-ONB-031 이미 가입된 계정으로 재로그인했지만 SIGN_UP_REQUIRED면 onb.signup.error.generic', () => {
    expect(map(new AlreadyRegisteredUnresolvedError())).toEqual({
      kind: 'message',
      message: t('onb.signup.error.generic'),
      backToDraw: false,
    });
  });

  it('TC-ONB-044 취소(CancelledError)는 아무것도 보이지 않는다', () => {
    expect(map(new CancelledError('aborted'))).toEqual({ kind: 'ignore' });
  });
});

describe('mapSignatureError: 변경(change)', () => {
  const map = (e: unknown) => mapSignatureError(e, 'change');

  it('TC-SIGN-030 TC-SIGN-031 403 FORBIDDEN은 auth.banned.signature 토스트(알림·로그인 이동 없음)', () => {
    expect(map(httpError(403, 'signature/users-me-signature-uploads__forbidden-banned'))).toEqual({
      kind: 'toast',
      message: t('auth.banned.signature'),
    });
    expect(map(httpError(403, 'signature/users-me-signature__put-forbidden-banned'))).toEqual({
      kind: 'toast',
      message: t('auth.banned.signature'),
    });
  });

  it('TC-SIGN-033 401은 로그인 + sign.error.expired', () => {
    expect(map(httpError(401, 'signature/users-me-signature__put-unauthorized'))).toEqual({
      kind: 'login',
      message: t('sign.error.expired'),
    });
    expect(map(new ReauthenticationRequiredError('x'))).toEqual({
      kind: 'login',
      message: t('sign.error.expired'),
    });
  });

  it('TC-SIGN-028 SIGNATURE_REUPLOAD_REQUIRED는 onb.signup.error.reupload(다음 시도는 새 업로드부터)', () => {
    const e = new HttpError(400, 'SIGNATURE_REUPLOAD_REQUIRED', '재업로드');
    expect(map(e)).toEqual({
      kind: 'message',
      message: t('onb.signup.error.reupload'),
      backToDraw: false,
    });
  });

  it('TC-SIGN-029 400 BUSINESS_ERROR는 sign.error.invalid + 그리기로', () => {
    expect(map(httpError(400, 'signature/users-me-signature__put-invalid-signature'))).toEqual({
      kind: 'message',
      message: t('sign.error.invalid'),
      backToDraw: true,
    });
  });

  it('TC-SIGN-032 404는 sign.change.error.not-found', () => {
    expect(map(httpError(404, 'signature/users-me-signature__put-upload-not-found'))).toEqual({
      kind: 'message',
      message: t('sign.change.error.not-found'),
      backToDraw: false,
    });
  });

  it('TC-SIGN-023 presigned PUT 실패는 sign.change.error.generic', () => {
    expect(
      map(new SignatureUploadError(httpError(403, 'signature/presigned-put__forbidden'))),
    ).toEqual({
      kind: 'message',
      message: t('sign.change.error.generic'),
      backToDraw: false,
    });
  });

  it('TC-SIGN-034 TC-SIGN-035 네트워크는 sign.error.network, 500은 sign.change.error.generic', () => {
    expect(map(new TimeoutError('t'))).toEqual({
      kind: 'message',
      message: t('sign.error.network'),
      backToDraw: false,
    });
    expect(map(httpError(500, 'signature/users-me-signature__put-internal-error'))).toEqual({
      kind: 'message',
      message: t('sign.change.error.generic'),
      backToDraw: false,
    });
  });

  it('TC-SIGN-037 취소는 아무것도 보이지 않는다', () => {
    expect(map(new CancelledError('aborted'))).toEqual({ kind: 'ignore' });
  });
});
