import { HttpError, InvalidResponseError, NetworkError, TimeoutError } from './ApiError';
import { createNetHarness, type NetHarness } from './__testing__/createNetHarness';
import { json, noContent, raw } from './__testing__/FakeTransport';

const identity = (raw: unknown) => raw;

describe('ApiClient 응답·오류 해석', () => {
  let h: NetHarness;
  beforeEach(() => {
    h = createNetHarness();
  });

  const getTopics = () => h.api.requestJson({ method: 'GET', path: '/topics' }, identity);

  describe('오류 응답', () => {
    it('TC-NET-001 오류 바디를 HttpError로 던진다', async () => {
      h.transport.script(json(400, { errorCode: 'BUSINESS_ERROR', message: '안 돼요' }));
      const error = await getTopics().catch((e) => e);
      expect(error).toBeInstanceOf(HttpError);
      expect(error).toMatchObject({
        status: 400,
        errorCode: 'BUSINESS_ERROR',
        serverMessage: '안 돼요',
      });
    });

    it('TC-NET-002 알 수 없는 errorCode는 BUSINESS_ERROR로 취급되어 앱이 깨지지 않는다', async () => {
      h.transport.script(json(400, { errorCode: 'SOMETHING_NEW', message: 'x' }));
      await expect(getTopics()).rejects.toMatchObject({ status: 400, errorCode: 'BUSINESS_ERROR' });
    });

    it('TC-NET-004 HTML 게이트웨이 502는 status만 가진 HttpError다(멱등 GET은 재시도 후 마지막 오류)', async () => {
      h.transport.script(raw(502, '<html>Bad Gateway</html>', 'text/html'));
      await expect(getTopics()).rejects.toMatchObject({ status: 502, errorCode: null });
    });

    it('TC-NET-004 빈 본문 500도 status를 보존한다', async () => {
      h.transport.script(raw(500, ''));
      await expect(getTopics()).rejects.toMatchObject({ status: 500, errorCode: null });
    });

    it('TC-NET-033 필터 단계 403 "접근 권한이 없습니다."도 HttpError(FORBIDDEN)로 던진다', async () => {
      // fixture: common/error__forbidden-no-permission.json
      h.transport.script(json(403, { errorCode: 'FORBIDDEN', message: '접근 권한이 없습니다.' }));
      await expect(getTopics()).rejects.toMatchObject({ status: 403, errorCode: 'FORBIDDEN' });
    });

    it('TC-NET-034 404 "요청한 API를 찾을 수 없습니다."는 HttpError(404, BUSINESS_ERROR)다', async () => {
      // fixture: common/error__not-found-api.json
      h.transport.script(
        json(404, { errorCode: 'BUSINESS_ERROR', message: '요청한 API를 찾을 수 없습니다.' }),
      );
      await expect(getTopics()).rejects.toMatchObject({ status: 404, errorCode: 'BUSINESS_ERROR' });
    });

    it('TC-NET-035 검증 오류 400은 HttpError로 던져지고 message는 serverMessage에만 있다', async () => {
      // fixture: common/error__validation-format.json
      const message = 'date: 요청 값의 형식이 올바르지 않습니다.';
      h.transport.script(json(400, { errorCode: 'BUSINESS_ERROR', message }));
      const error = (await getTopics().catch((e) => e)) as HttpError;
      expect(error.serverMessage).toBe(message);
      expect(error.message).not.toContain('형식이 올바르지');
    });

    it('TC-NET-036 500 INTERNAL_ERROR는 HttpError(500, INTERNAL_ERROR)다', async () => {
      // fixture: common/error__internal-500.json
      h.transport.script(json(500, { errorCode: 'INTERNAL_ERROR', message: '서버 오류' }));
      await expect(getTopics()).rejects.toMatchObject({ status: 500, errorCode: 'INTERNAL_ERROR' });
    });

    it('TC-NET-032 403 FORBIDDEN은 같은 요청을 다시 보내지 않는다', async () => {
      // fixture: common/error__forbidden-banned.json
      await h.signIn();
      h.transport.script(json(403, { errorCode: 'FORBIDDEN', message: '차단된 회원입니다.' }));
      await expect(
        h.api.requestJson({ method: 'PUT', path: '/posts/abc', body: { title: 't' } }, identity),
      ).rejects.toMatchObject({ status: 403, errorCode: 'FORBIDDEN' });
      expect(h.transport.requests).toHaveLength(1);
    });

    it('REQ-NET-016 3xx 응답은 따라가지 않고 실패한다', async () => {
      h.transport.script(raw(302, '', null, { location: 'http://evil.test/' }));
      await expect(getTopics()).rejects.toBeInstanceOf(HttpError);
      expect(h.transport.requests).toHaveLength(1);
    });
  });

  describe('성공 응답 해석', () => {
    it('TC-NET-005 200인데 JSON이 깨지면 InvalidResponseError다', async () => {
      // fixture: common/ok__malformed-json.json
      h.transport.script(raw(200, '{"topics":[', 'application/json'));
      await expect(getTopics()).rejects.toBeInstanceOf(InvalidResponseError);
    });

    it('TC-NET-006 본문이 필요한 API가 200 빈 본문이면 InvalidResponseError다', async () => {
      // fixture: common/ok__empty-body.json
      h.transport.script(raw(200, '', 'application/json'));
      await expect(getTopics()).rejects.toBeInstanceOf(InvalidResponseError);
    });

    it('TC-NET-007 204는 requestVoid에서 성공이고 본문 디코딩을 시도하지 않는다', async () => {
      // fixture: auth/logout__no-content.json
      await h.signIn();
      h.transport.script(noContent());
      await expect(
        h.api.requestVoid({ method: 'DELETE', path: '/users/me' }),
      ).resolves.toBeUndefined();
    });

    it('TC-NET-007 requestVoid는 2xx 본문이 쓰레기여도 성공이다', async () => {
      h.transport.script(raw(200, 'not json', 'text/plain'));
      await expect(
        h.api.requestVoid({ method: 'PATCH', path: '/notification-settings', body: {} }),
      ).resolves.toBeUndefined();
    });

    it('TC-NET-008 알 수 없는 JSON 필드는 decode에 그대로 전달되어 무시할 수 있다', async () => {
      // fixture: common/ok__extra-fields.json
      h.transport.script(json(200, { id: 'x', brandNewField: 1 }));
      const value = await h.api.requestJson(
        { method: 'GET', path: '/topics' },
        (r) => (r as { id: string }).id,
      );
      expect(value).toBe('x');
    });

    it('TC-NET-010 decode가 던지면(필수 필드 누락) InvalidResponseError로 바뀐다', async () => {
      // fixture: common/ok__missing-required.json
      h.transport.script(json(200, {}));
      await expect(
        h.api.requestJson({ method: 'GET', path: '/topics' }, () => {
          throw new Error('missing field');
        }),
      ).rejects.toBeInstanceOf(InvalidResponseError);
    });

    it('TC-NET-011 Content-Type이 JSON이 아닌 200은 InvalidResponseError다', async () => {
      // fixture: common/ok__wrong-content-type.json
      h.transport.script(raw(200, '<html></html>', 'text/html'));
      await expect(getTopics()).rejects.toBeInstanceOf(InvalidResponseError);
    });

    it('TC-NET-011 Content-Type에 charset이 붙은 application/json은 허용한다', async () => {
      h.transport.script(raw(200, '{"a":1}', 'application/json; charset=utf-8'));
      await expect(getTopics()).resolves.toEqual({ a: 1 });
    });
  });

  describe('연결 계열 오류 통일', () => {
    it.each([
      ['fetch TypeError', () => new TypeError('Network request failed')],
      ['NetworkError', () => new NetworkError('dns')],
    ])('TC-NET-045 %s는 NetworkError로 매핑된다(4xx가 아니므로 재시도 후)', async (_n, make) => {
      h.transport.script(make());
      await expect(getTopics()).rejects.toBeInstanceOf(NetworkError);
    });

    it('TC-NET-045 타임아웃은 TimeoutError(NetworkError의 하위)로 전달된다', async () => {
      h.transport.script(new TimeoutError('t'));
      const error = await getTopics().catch((e) => e);
      expect(error).toBeInstanceOf(TimeoutError);
      expect(error).toBeInstanceOf(NetworkError);
    });
  });
});
