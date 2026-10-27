import { decideErrorPresentation, userMessageKey } from './userMessage';
import { ApiError, ConfigError, InvalidResponseError, NetworkError } from './errors';

describe('userMessageKey', () => {
  it('TC-NET-045 NetworkError는 어디서나 common.error.network다', () => {
    expect(userMessageKey(new NetworkError('timeout'))).toBe('common.error.network');
    expect(userMessageKey(new NetworkError('connection'), 'common.error.config')).toBe('common.error.network');
  });

  it('REQ-NET-002 ConfigError는 common.error.config다', () => {
    expect(userMessageKey(new ConfigError('bad base url'))).toBe('common.error.config');
  });

  it('TC-NET-036 500 INTERNAL_ERROR는 일반 오류 문구다', () => {
    expect(userMessageKey(new ApiError(500, 'INTERNAL_ERROR', '서버에서 요청을 처리하지 못했습니다.'))).toBe('common.error.generic');
  });

  it('TC-NET-033 TC-NET-034 TC-NET-035 서버 message와 무관하게 일반 문구를 쓴다(message는 표시용·로그용)', () => {
    expect(userMessageKey(new ApiError(403, 'FORBIDDEN', '접근 권한이 없습니다.'))).toBe('common.error.generic');
    expect(userMessageKey(new ApiError(404, 'BUSINESS_ERROR', '요청한 API를 찾을 수 없습니다.'))).toBe('common.error.generic');
    expect(userMessageKey(new ApiError(400, 'BUSINESS_ERROR', 'date: 요청 값의 형식이 올바르지 않습니다.'))).toBe('common.error.generic');
  });

  it('TC-NET-035 화면 고유 fallback이 있으면 그 문구 키를 쓴다', () => {
    expect(userMessageKey(new ApiError(400, 'BUSINESS_ERROR', 'x'), 'common.error.config')).toBe('common.error.config');
  });

  it('REQ-NET-010 해석 불가 응답이나 알 수 없는 예외도 일반 문구다', () => {
    expect(userMessageKey(new InvalidResponseError('missing id'))).toBe('common.error.generic');
    expect(userMessageKey('weird')).toBe('common.error.generic');
  });
});

describe('decideErrorPresentation', () => {
  it('TC-NET-046 콘텐츠가 이미 보이면 토스트만 띄운다(콘텐츠 유지)', () => {
    expect(decideErrorPresentation({ error: new NetworkError('connection'), hasContent: true })).toEqual({ kind: 'toast', copyKey: 'common.error.network' });
  });

  it('TC-NET-047 콘텐츠가 없으면 오류 화면(다시 시도)이다', () => {
    expect(decideErrorPresentation({ error: new NetworkError('connection'), hasContent: false })).toEqual({ kind: 'error_screen', copyKey: 'common.error.network' });
    expect(decideErrorPresentation({ error: new ApiError(500, 'INTERNAL_ERROR', 'x'), hasContent: false })).toEqual({ kind: 'error_screen', copyKey: 'common.error.generic' });
  });

  it('TC-NET-048 취소는 오류 화면도 토스트도 아니다', () => {
    const abort = new DOMException('aborted', 'AbortError');
    expect(decideErrorPresentation({ error: abort, hasContent: true })).toEqual({ kind: 'none' });
    expect(decideErrorPresentation({ error: abort, hasContent: false })).toEqual({ kind: 'none' });
  });
});
