import { ApiError, isCancellation, NetworkError, parseErrorResponse } from './errors';
import { errorBodies, gatewayHtml } from '../../test/fixtures';

describe('parseErrorResponse', () => {
  it('TC-NET-001 {errorCode, message}를 ApiError(status, errorCode, message)로 바꾼다', () => {
    const e = parseErrorResponse(400, JSON.stringify(errorBodies.business400));
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(400);
    expect(e.errorCode).toBe('BUSINESS_ERROR');
    expect(e.message).toBe('조회 조건이 올바르지 않습니다.');
  });

  it('TC-NET-001 알려진 errorCode는 그대로 보존한다', () => {
    for (const code of ['UNAUTHORIZED', 'REAUTHENTICATION_REQUIRED', 'FORBIDDEN', 'INTERNAL_ERROR'] as const) {
      expect(parseErrorResponse(401, JSON.stringify({ errorCode: code, message: 'm' })).errorCode).toBe(code);
    }
  });

  it('TC-NET-002 알 수 없는 errorCode는 BUSINESS_ERROR로 취급하고 원래 문자열은 rawErrorCode에 남긴다', () => {
    const e = parseErrorResponse(400, JSON.stringify(errorBodies.unknownCode));
    expect(e.errorCode).toBe('BUSINESS_ERROR');
    expect(e.rawErrorCode).toBe('SOMETHING_NEW');
    expect(e.status).toBe(400);
  });

  it('TC-NET-003 RESOURCE_STATE_CHANGED, USER_METRICS_AGGREGATION_IN_PROGRESS는 BUSINESS_ERROR와 같다', () => {
    expect(parseErrorResponse(400, JSON.stringify(errorBodies.resourceStateChanged)).errorCode).toBe('BUSINESS_ERROR');
    expect(parseErrorResponse(400, JSON.stringify(errorBodies.metricsAggregation)).errorCode).toBe('BUSINESS_ERROR');
  });

  it.each([
    ['HTML 게이트웨이', 502, gatewayHtml],
    ['빈 본문', 500, ''],
    ['비 JSON 텍스트', 503, 'upstream connect error'],
    ['JSON이지만 객체 아님', 500, '[1,2]'],
    ['errorCode가 문자열 아님', 400, '{"errorCode": 5, "message": "x"}'],
  ])('TC-NET-004 %s이면 status만 보존하고 errorCode는 null이다', (_name, status, body) => {
    const e = parseErrorResponse(status, body);
    expect(e.status).toBe(status);
    expect(e.errorCode).toBeNull();
    expect(e.rawErrorCode).toBeNull();
  });

  it('TC-NET-004 message가 없으면 빈 문자열로 만들고 던지지 않는다', () => {
    expect(parseErrorResponse(400, '{"errorCode":"BUSINESS_ERROR"}').message).toBe('');
  });

  it('TC-NET-033 TC-NET-034 필터 단계 403과 404 BUSINESS_ERROR도 같은 규칙으로 파싱한다', () => {
    const forbidden = parseErrorResponse(403, JSON.stringify(errorBodies.forbiddenNoPermission));
    expect([forbidden.status, forbidden.errorCode]).toEqual([403, 'FORBIDDEN']);
    const notFound = parseErrorResponse(404, JSON.stringify(errorBodies.notFoundApi));
    expect([notFound.status, notFound.errorCode]).toEqual([404, 'BUSINESS_ERROR']);
  });
});

describe('isCancellation', () => {
  it('TC-NET-048 AbortError는 취소이고 NetworkError나 일반 오류는 취소가 아니다', () => {
    expect(isCancellation(new DOMException('aborted', 'AbortError'))).toBe(true);
    expect(isCancellation(new NetworkError('connection'))).toBe(false);
    expect(isCancellation(new TypeError('Failed to fetch'))).toBe(false);
    expect(isCancellation(undefined)).toBe(false);
  });
});
