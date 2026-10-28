import {
  AuthenticationRequiredError,
  CancelledError,
  HttpError,
  InvalidResponseError,
  NetworkError,
  ReauthenticationRequiredError,
  TimeoutError,
} from '../../core/http/ApiError';
import { t } from '../../shared/copy';
import { mapUploadError, type UploadStage } from './mapUploadError';
import { SizeLimitExceededError, UnsupportedContentTypeError } from './UploadErrors';

const msg = (message: string) => ({ kind: 'message', message });
const STAGES: UploadStage[] = ['policy', 'encode', 'put', 'create'];

describe('mapUploadError', () => {
  it.each(STAGES)('REQ-UPL-056 [%s] 403은 어느 단계든 정지 안내다', (stage) => {
    expect(mapUploadError(stage, new HttpError(403, 'FORBIDDEN', '서버 문구'))).toEqual(
      msg(t('upload.gate.banned')),
    );
  });

  it.each(STAGES)('REQ-UPL-057 [%s] 네트워크·타임아웃은 통일 문구다', (stage) => {
    expect(mapUploadError(stage, new NetworkError('offline'))).toEqual(
      msg(t('upload.error.network')),
    );
    expect(mapUploadError(stage, new TimeoutError('slow'))).toEqual(msg(t('upload.error.network')));
  });

  it('REQ-UPL-058 정책 발급의 그 밖 실패는 준비 실패 문구다', () => {
    expect(mapUploadError('policy', new HttpError(500, 'INTERNAL_ERROR', null))).toEqual(
      msg(t('upload.error.prepare')),
    );
    expect(mapUploadError('policy', new InvalidResponseError('missing fields'))).toEqual(
      msg(t('upload.error.prepare')),
    );
  });

  it('TC-UPL-025·042·REQ-UPL-026 인코딩 실패(크기 초과, 잘못된 contentType)는 준비 실패 문구다', () => {
    expect(mapUploadError('encode', new SizeLimitExceededError())).toEqual(
      msg(t('upload.error.prepare')),
    );
    expect(mapUploadError('policy', new UnsupportedContentTypeError('image/png'))).toEqual(
      msg(t('upload.error.prepare')),
    );
    expect(mapUploadError('encode', new Error('decoder'))).toEqual(msg(t('upload.error.prepare')));
  });

  it('TC-UPL-055·056 PUT 거절(S3 403·5xx)과 https가 아닌 URL은 업로드 실패 문구다', () => {
    // S3의 403은 서명 불일치·만료이므로 정지 안내가 아니다. [가정: PUT 단계의 403은 정지 안내보다 업로드 실패]
    expect(mapUploadError('put', new HttpError(403, null, null))).toEqual(
      msg(t('upload.error.upload')),
    );
    expect(mapUploadError('put', new HttpError(500, null, null))).toEqual(
      msg(t('upload.error.upload')),
    );
    expect(mapUploadError('put', new InvalidResponseError('insecure upload url'))).toEqual(
      msg(t('upload.error.upload')),
    );
  });

  it('REQ-UPL-058 생성의 그 밖 실패는 전시 실패 문구다', () => {
    expect(mapUploadError('create', new HttpError(500, 'INTERNAL_ERROR', null))).toEqual(
      msg(t('upload.error.create')),
    );
    expect(mapUploadError('create', new InvalidResponseError('bad body'))).toEqual(
      msg(t('upload.error.create')),
    );
  });

  it('D-02 생성의 서버 message는 분기에 쓰지 않고 그 밖 실패 문구로 떨어진다(400 판정은 UploadSubmitter)', () => {
    expect(
      mapUploadError(
        'create',
        new HttpError(400, 'BUSINESS_ERROR', '이미 이 주제에 게시물을 작성했습니다.'),
      ),
    ).toEqual(msg(t('upload.error.create')));
  });

  it.each(STAGES)('D-17 [%s] 401은 로그인 안내로 분기한다', (stage) => {
    expect(mapUploadError(stage, new AuthenticationRequiredError('401'))).toEqual({
      kind: 'login-required',
    });
    expect(mapUploadError(stage, new ReauthenticationRequiredError('reauth'))).toEqual({
      kind: 'session-expired',
    });
  });

  it.each(STAGES)('D-20 [%s] 취소는 오류로 보이지 않는다', (stage) => {
    expect(mapUploadError(stage, new CancelledError('aborted'))).toEqual({ kind: 'cancelled' });
  });
});
