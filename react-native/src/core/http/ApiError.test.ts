import { HttpError, NetworkError, TimeoutError, parseErrorBody } from './ApiError';

describe('parseErrorBody', () => {
  // fixture: common/error__business-400.json
  const businessBody = JSON.stringify({
    errorCode: 'BUSINESS_ERROR',
    message: '요청을 처리할 수 없습니다.',
  });

  it('TC-NET-001 {errorCode, message}를 HttpError(status, errorCode, message)로 변환한다', () => {
    const error = parseErrorBody(400, businessBody);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(400);
    expect(error.errorCode).toBe('BUSINESS_ERROR');
    expect(error.serverMessage).toBe('요청을 처리할 수 없습니다.');
  });

  it('TC-NET-002 알 수 없는 errorCode는 BUSINESS_ERROR로 정규화하고 원본 코드는 보존한다', () => {
    // fixture: common/error__unknown-error-code.json
    const error = parseErrorBody(400, JSON.stringify({ errorCode: 'SOMETHING_NEW', message: 'x' }));
    expect(error.errorCode).toBe('BUSINESS_ERROR');
    expect(error.rawErrorCode).toBe('SOMETHING_NEW');
  });

  it.each(['RESOURCE_STATE_CHANGED', 'USER_METRICS_AGGREGATION_IN_PROGRESS'])(
    'TC-NET-003 사용자 API에 없는 코드 %s는 BUSINESS_ERROR와 같게 처리한다',
    (code) => {
      // fixture: common/error__resource-state-changed.json
      const error = parseErrorBody(400, JSON.stringify({ errorCode: code, message: 'x' }));
      expect(error.errorCode).toBe('BUSINESS_ERROR');
    },
  );

  it.each([
    ['UNAUTHORIZED', 401],
    ['REAUTHENTICATION_REQUIRED', 401],
    ['FORBIDDEN', 403],
    ['INTERNAL_ERROR', 500],
    ['SIGNATURE_PROCESSING_PENDING', 400],
    ['SIGNATURE_REUPLOAD_REQUIRED', 400],
    ['SIGNATURE_REGISTRATION_REQUIRED', 400],
  ])('TC-NET-001 알려진 코드 %s는 그대로 보존한다', (code, status) => {
    expect(
      parseErrorBody(status, JSON.stringify({ errorCode: code, message: 'm' })).errorCode,
    ).toBe(code);
  });

  it.each([
    // fixture: common/error__bad-gateway-html.json
    ['HTML 게이트웨이', 502, '<html><body>Bad Gateway</body></html>'],
    // fixture: common/error__empty-body-500.json
    ['빈 본문', 500, ''],
    ['JSON이지만 errorCode 없음', 404, '{"foo":1}'],
    ['깨진 JSON', 503, '{"errorCode":'],
    ['JSON 배열', 400, '[1,2]'],
  ])('TC-NET-004 %s이면 status만 보존하고 errorCode는 null이다', (_name, status, body) => {
    const error = parseErrorBody(status, body);
    expect(error.status).toBe(status);
    expect(error.errorCode).toBeNull();
    expect(error.serverMessage).toBeNull();
  });

  it('REQ-NET-007 message가 비어 있거나 타입이 달라도 깨지지 않는다', () => {
    const error = parseErrorBody(
      400,
      JSON.stringify({ errorCode: 'BUSINESS_ERROR', message: 123 }),
    );
    expect(error.errorCode).toBe('BUSINESS_ERROR');
    expect(error.serverMessage).toBeNull();
  });
});

describe('ApiError 계층', () => {
  it('TC-NET-045 TimeoutError는 NetworkError이므로 같은 문구로 처리된다', () => {
    expect(new TimeoutError('t')).toBeInstanceOf(NetworkError);
  });
});
