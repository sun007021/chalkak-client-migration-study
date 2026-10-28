import {
  HttpError,
  InvalidResponseError,
  ReauthenticationRequiredError,
} from '../../core/http/ApiError';
import { networkFailure } from '../../core/http/__testing__/FakeTransport';
import {
  createNetHarness,
  refreshOk,
  reauth,
  unauthorized,
} from '../../core/http/__testing__/createNetHarness';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { authorizationOf, pathOf } from '../__testing__/requestAsserts';
import { NotificationSettingsRepository } from './NotificationSettingsRepository';

async function setup() {
  const net = createNetHarness();
  await net.signIn();
  return { ...net, repository: new NotificationSettingsRepository({ api: net.api }) };
}

const bodyOf = (request: { body?: string | Uint8Array }) => JSON.parse(String(request.body));

describe('NotificationSettingsRepository.get', () => {
  it('TC-SET-014 GET /notification-settings를 Bearer와 함께 부르고 세 필드를 읽는다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('settings/notification-settings__get-all-true'));
    const settings = await h.repository.get();
    const request = h.transport.requests[0];
    expect(request.method).toBe('GET');
    expect(pathOf(request)).toBe('/notification-settings');
    expect(authorizationOf(request)).toBe('Bearer access-1');
    expect(settings).toEqual({ topic: true, moderation: true, aiReview: true });
  });

  it('TC-SET-014 꺼진 AI 설정도 그대로 반영하고 다른 항목에 번지지 않는다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('settings/notification-settings__get-ai-off'));
    expect(await h.repository.get()).toEqual({ topic: true, moderation: true, aiReview: false });
  });

  it('TC-SET-037 주제만 꺼진 응답도 항목별로 읽는다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('settings/notification-settings__get-topic-off'));
    expect(await h.repository.get()).toEqual({ topic: false, moderation: true, aiReview: true });
  });

  it.each([
    ['필드 누락', 'settings/notification-settings__get-field-missing'],
    ['null 필드', 'settings/notification-settings__get-null-field'],
  ])('TC-SET-015 %s 응답은 InvalidResponseError(잘못된 응답)다', async (_name, fixture) => {
    const h = await setup();
    h.transport.script(fixtureResponse(fixture));
    await expect(h.repository.get()).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-SET-034 401이면 refresh 뒤 원 요청을 1회 재전송한다', async () => {
    const h = await setup();
    h.transport.respond((request) => {
      if (pathOf(request) === '/auth/refresh') return refreshOk();
      return authorizationOf(request) === 'Bearer access-2'
        ? fixtureResponse('settings/notification-settings__get-all-true')
        : unauthorized();
    });
    await expect(h.repository.get()).resolves.toEqual({
      topic: true,
      moderation: true,
      aiReview: true,
    });
    expect(h.transport.requestsTo('GET', '/notification-settings')).toHaveLength(2);
  });

  it('TC-SET-034 REAUTHENTICATION_REQUIRED면 ReauthenticationRequiredError로 끝난다', async () => {
    const h = await setup();
    h.transport.respond((request) =>
      pathOf(request) === '/auth/refresh' ? reauth() : unauthorized(),
    );
    await expect(h.repository.get()).rejects.toBeInstanceOf(ReauthenticationRequiredError);
  });
});

describe('NotificationSettingsRepository.update', () => {
  it.each([
    { tc: 'TC-SET-019', key: 'topic', field: 'topicPushEnabled', value: false },
    { tc: 'TC-SET-020', key: 'moderation', field: 'moderationPushEnabled', value: false },
    { tc: 'TC-SET-021', key: 'aiReview', field: 'aiReviewPushEnabled', value: true },
  ] as const)(
    '$tc $key 변경은 PATCH 바디에 바뀐 항목($field) 하나만 담는다',
    async ({ key, field, value }) => {
      const h = await setup();
      h.transport.script(fixtureResponse('settings/notification-settings__patch-no-content'));
      await h.repository.update(key, value);
      const request = h.transport.requests[0];
      expect(request.method).toBe('PATCH');
      expect(pathOf(request)).toBe('/notification-settings');
      expect(authorizationOf(request)).toBe('Bearer access-1');
      expect(bodyOf(request)).toEqual({ [field]: value });
    },
  );

  it('TC-SET-022 204 본문 없음을 성공으로 읽고 값을 돌려주지 않는다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('settings/notification-settings__patch-no-content'));
    await expect(h.repository.update('topic', true)).resolves.toBeUndefined();
  });

  it('TC-SET-035 PATCH는 멱등이라 500이면 0.5초, 1초 백오프로 최대 2회 재시도하고 소진 뒤 실패한다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('settings/notification-settings__patch-internal-error'));
    await expect(h.repository.update('topic', false)).rejects.toBeInstanceOf(HttpError);
    expect(h.transport.requestsTo('PATCH', '/notification-settings')).toHaveLength(3);
    expect(h.sleeper.calls).toEqual([500, 1000]);
  });

  it('TC-SET-035 네트워크 오류 뒤 재시도가 성공하면 성공으로 끝난다', async () => {
    const h = await setup();
    h.transport.script(
      networkFailure(),
      fixtureResponse('settings/notification-settings__patch-no-content'),
    );
    await expect(h.repository.update('moderation', false)).resolves.toBeUndefined();
    expect(h.transport.requestsTo('PATCH', '/notification-settings')).toHaveLength(2);
  });

  it('TC-SET-036 값이 없는 요청은 보내지 않고 던진다(서버 400 방지)', async () => {
    const h = await setup();
    await expect(
      h.repository.update('topic', undefined as unknown as boolean),
    ).rejects.toBeInstanceOf(Error);
    expect(h.transport.requests).toHaveLength(0);
  });

  it('TC-SET-036 서버가 400 BUSINESS_ERROR로 답하면 HttpError 400으로 전달한다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('settings/notification-settings__patch-bad-request-empty'));
    await expect(h.repository.update('topic', true)).rejects.toMatchObject({
      status: 400,
      errorCode: 'BUSINESS_ERROR',
    });
  });

  it('TC-SET-034 PATCH 401이면 refresh 뒤 1회 재전송한다', async () => {
    const h = await setup();
    h.transport.respond((request) => {
      if (pathOf(request) === '/auth/refresh') return refreshOk();
      return authorizationOf(request) === 'Bearer access-2'
        ? fixtureResponse('settings/notification-settings__patch-no-content')
        : fixtureResponse('settings/notification-settings__patch-unauthorized');
    });
    await expect(h.repository.update('aiReview', false)).resolves.toBeUndefined();
    expect(h.transport.requestsTo('PATCH', '/notification-settings')).toHaveLength(2);
  });
});
