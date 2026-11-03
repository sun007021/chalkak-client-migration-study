import { ApiError, InvalidResponseError } from '../../core/net/errors';
import { makeApiEnv } from '../../test/apiEnv';
import { loadFixture, memberSession } from '../../test/fixtures';
import { track } from '../../test/track';
import { SignatureRepository } from '../signature/SignatureRepository';
import { PUSH_SETTING_KEYS, NotificationSettingsRepository } from './NotificationSettingsRepository';
import type { PushSettingKey } from './NotificationSettingsRepository';

function setup() {
  const env = makeApiEnv(memberSession());
  return { ...env, repo: new NotificationSettingsRepository({ api: env.client() }) };
}
const respond = (fixture: string) => () => loadFixture(fixture).toResponse();
const refreshOk = respond('auth/refresh__success.json');

describe('NotificationSettingsRepository.fetch', () => {
  it('TC-SET-014 GET /notification-settings는 Bearer와 함께 보내고 세 필드를 읽는다', async () => {
    const { ff, repo } = setup();
    ff.route('GET /notification-settings', respond('settings/notification-settings__get-all-true.json'));
    expect(await repo.fetch()).toEqual({ topicPushEnabled: true, moderationPushEnabled: true, aiReviewPushEnabled: true });
    const call = ff.calls[0]!;
    expect(call.method).toBe('GET');
    expect(call.headers['authorization']).toBe('Bearer fixture-access-token-1');
    expect(call.body).toBeNull();
  });

  it('TC-SET-014 꺼진 AI 설정과 꺼진 주제 설정도 그대로 반영한다', async () => {
    const { ff, repo } = setup();
    ff.route('GET /notification-settings', respond('settings/notification-settings__get-ai-off.json'));
    expect(await repo.fetch()).toEqual({ topicPushEnabled: true, moderationPushEnabled: true, aiReviewPushEnabled: false });
    const other = setup();
    other.ff.route('GET /notification-settings', respond('settings/notification-settings__get-topic-off.json'));
    expect(await other.repo.fetch()).toEqual({ topicPushEnabled: false, moderationPushEnabled: true, aiReviewPushEnabled: true });
  });

  it.each(['get-field-missing', 'get-null-field'])('TC-SET-015 세 필드 중 하나가 없거나 null이면(%s) InvalidResponseError다', async (name) => {
    const { ff, repo } = setup();
    ff.route('GET /notification-settings', respond(`settings/notification-settings__${name}.json`));
    await expect(repo.fetch()).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-SET-034 GET이 401 UNAUTHORIZED면 refresh 뒤 한 번 다시 보내 성공한다', async () => {
    const { ff, repo } = setup();
    ff.route('GET /notification-settings', respond('settings/notification-settings__get-unauthorized.json'), respond('settings/notification-settings__get-all-true.json'));
    ff.route('POST /auth/refresh', refreshOk);
    expect(await repo.fetch()).toEqual({ topicPushEnabled: true, moderationPushEnabled: true, aiReviewPushEnabled: true });
    expect(ff.callsTo('GET /notification-settings')).toHaveLength(2);
    expect(ff.callsTo('POST /auth/refresh')).toHaveLength(1);
  });

  it('TC-SET-034 REAUTHENTICATION_REQUIRED면 재전송 없이 실패하고 세션 만료를 알린다', async () => {
    const { ff, repo, expired } = setup();
    ff.route('GET /notification-settings', respond('settings/notification-settings__get-unauthorized.json'));
    ff.route('POST /auth/refresh', respond('auth/refresh__reauthentication-required.json'));
    await expect(repo.fetch()).rejects.toMatchObject({ status: 401 });
    expect(ff.callsTo('GET /notification-settings')).toHaveLength(1);
    expect(expired.count).toBe(1);
  });
});

describe('NotificationSettingsRepository.update', () => {
  it.each<[string, PushSettingKey]>([
    ['TC-SET-019', 'topicPushEnabled'],
    ['TC-SET-020', 'moderationPushEnabled'],
    ['TC-SET-021', 'aiReviewPushEnabled'],
  ])('%s PATCH /notification-settings 바디는 바뀐 항목(%s) 하나만 있다', async (_tc, key) => {
    const { ff, repo } = setup();
    ff.route('PATCH /notification-settings', respond('settings/notification-settings__patch-no-content.json'));
    await repo.update({ [key]: false });
    const call = ff.calls[0]!;
    expect(call.method).toBe('PATCH');
    expect(call.headers['authorization']).toBe('Bearer fixture-access-token-1');
    expect(call.headers['content-type']).toContain('application/json');
    expect(JSON.parse(call.body as string)).toEqual({ [key]: false });
  });

  it('TC-SET-019 켜는 값(true)도 항목 하나만 보낸다', async () => {
    const { ff, repo } = setup();
    ff.route('PATCH /notification-settings', respond('settings/notification-settings__patch-no-content.json'));
    await repo.update({ aiReviewPushEnabled: true });
    expect(JSON.parse(ff.calls[0]!.body as string)).toEqual({ aiReviewPushEnabled: true });
  });

  it('TC-SET-022 204 본문 없음은 성공이고 아무 값도 돌려주지 않는다(본문 디코딩 시도 없음)', async () => {
    const { ff, repo } = setup();
    ff.route('PATCH /notification-settings', respond('settings/notification-settings__patch-no-content.json'));
    await expect(repo.update({ topicPushEnabled: false })).resolves.toBeUndefined();
  });

  it.each([[{}], [{ topicPushEnabled: undefined }], [{ moderationPushEnabled: undefined, aiReviewPushEnabled: undefined }]])(
    'TC-SET-036 바꿀 값이 하나도 없으면(%j) 빈 PATCH를 보내지 않고 거절한다',
    async (patch) => {
      const { ff, repo } = setup();
      ff.route('PATCH /notification-settings', respond('settings/notification-settings__patch-bad-request-empty.json'));
      await expect(repo.update(patch)).rejects.toBeInstanceOf(Error);
      expect(ff.calls).toHaveLength(0);
    },
  );

  it('TC-SET-036 서버가 400 BUSINESS_ERROR(빈 요청)를 돌려주면 ApiError(400)로 전달하고 재전송하지 않는다', async () => {
    const { ff, clock, repo } = setup();
    ff.route('PATCH /notification-settings', respond('settings/notification-settings__patch-bad-request-empty.json'));
    const result = track(repo.update({ topicPushEnabled: false }));
    await clock.advance(5_000);
    expect(result.error).toMatchObject({ status: 400, errorCode: 'BUSINESS_ERROR' });
    expect(ff.calls).toHaveLength(1);
  });

  it('TC-SET-035 PATCH는 멱등이라 500이면 0.5초, 1초 백오프로 최대 2회 재시도한 뒤 실패한다(총 3회)', async () => {
    const { ff, clock, repo } = setup();
    ff.route('PATCH /notification-settings', respond('settings/notification-settings__patch-internal-error.json'));
    const result = track(repo.update({ topicPushEnabled: false }));
    await clock.advance(0);
    expect(ff.calls).toHaveLength(1);
    await clock.advance(499);
    expect(ff.calls).toHaveLength(1);
    await clock.advance(1);
    expect(ff.calls).toHaveLength(2);
    await clock.advance(1_000);
    expect(ff.calls).toHaveLength(3);
    await clock.advance(10_000);
    expect(ff.calls).toHaveLength(3);
    expect(result.error).toBeInstanceOf(ApiError);
    expect(result.error).toMatchObject({ status: 500 });
  });

  it('TC-SET-034 PATCH가 401 UNAUTHORIZED면 refresh 뒤 같은 바디를 한 번 다시 보낸다', async () => {
    const { ff, repo } = setup();
    ff.route('PATCH /notification-settings', respond('settings/notification-settings__patch-unauthorized.json'), respond('settings/notification-settings__patch-no-content.json'));
    ff.route('POST /auth/refresh', refreshOk);
    await repo.update({ moderationPushEnabled: false });
    const calls = ff.callsTo('PATCH /notification-settings');
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => JSON.parse(c.body as string))).toEqual([{ moderationPushEnabled: false }, { moderationPushEnabled: false }]);
    expect(calls[1]!.headers['authorization']).not.toBe(calls[0]!.headers['authorization']);
  });

  it('TC-SET-034 PATCH가 REAUTHENTICATION_REQUIRED면 재전송 없이 실패하고 세션 만료를 알린다', async () => {
    const { ff, repo, expired } = setup();
    ff.route('PATCH /notification-settings', respond('settings/notification-settings__patch-unauthorized.json'));
    ff.route('POST /auth/refresh', respond('auth/refresh__reauthentication-required.json'));
    await expect(repo.update({ topicPushEnabled: false })).rejects.toMatchObject({ status: 401 });
    expect(ff.callsTo('PATCH /notification-settings')).toHaveLength(1);
    expect(expired.count).toBe(1);
  });
});

describe('푸시 설정 키', () => {
  it('화면 순서는 오늘 주제, 승인·반려, AI 피드백 완료이다', () => {
    expect(PUSH_SETTING_KEYS).toEqual(['topicPushEnabled', 'moderationPushEnabled', 'aiReviewPushEnabled']);
  });
});

describe('설정 사인 카드 요청', () => {
  it('TC-SET-013 사인 조회는 GET /users/me/signature, Bearer 헤더, 본문 없음이다', async () => {
    const env = makeApiEnv(memberSession());
    env.ff.route('GET /users/me/signature', respond('signature/users-me-signature__get-success.json'));
    await new SignatureRepository({ api: env.client() }).fetchCurrent();
    const call = env.ff.calls[0]!;
    expect([call.method, call.path]).toEqual(['GET', '/users/me/signature']);
    expect(call.headers['authorization']).toBe('Bearer fixture-access-token-1');
    expect(call.body).toBeNull();
  });
});
