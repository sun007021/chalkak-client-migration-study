import { HttpTokenRefresher } from './TokenRefresher';
import { RecordingLogger } from './Logger';
import { parseApiBaseUrl } from '../config/apiBaseUrl';
import { FakeClock } from '../time/FakeClock';
import { FakeFetch, emptyResponse, jsonResponse, networkFailure } from '../../test/fakeFetch';
import { track } from '../../test/track';
import { NOW, errorBodies, refreshSuccessBody } from '../../test/fixtures';

function setup() {
  const clock = new FakeClock(NOW);
  const ff = new FakeFetch();
  const logger = new RecordingLogger();
  const refresher = new HttpTokenRefresher({ fetch: ff.fetch, clock, baseUrl: parseApiBaseUrl('https://mock.local'), logger });
  return { clock, ff, logger, refresher };
}

describe('HttpTokenRefresher', () => {
  it('TC-NET-022 POST /auth/refresh {refreshToken}를 Authorization 없이 보내고 새 토큰 4종과 만료 시각(응답 초 값)을 돌려준다', async () => {
    const { clock, ff, refresher } = setup();
    ff.route('POST /auth/refresh', () => jsonResponse(200, refreshSuccessBody));
    const result = track(refresher.refresh('refresh-1'));
    await clock.advance(0);
    const call = ff.calls[0]!;
    expect(call.method).toBe('POST');
    expect(call.url).toBe('https://mock.local/api/v1/auth/refresh');
    expect(JSON.parse(call.body as string)).toEqual({ refreshToken: 'refresh-1' });
    expect(call.headers['content-type']).toBe('application/json');
    expect(call.headers['authorization']).toBeUndefined();
    expect(result.value).toEqual({
      kind: 'success',
      tokens: {
        accessToken: 'access-2',
        accessTokenExpiresAt: NOW + 900_000,
        refreshToken: 'refresh-2',
        refreshTokenExpiresAt: NOW + 2_592_000_000,
      },
    });
  });

  it('TC-NET-021 REAUTHENTICATION_REQUIRED는 reauthentication_required다', async () => {
    const { clock, ff, refresher } = setup();
    ff.route('POST /auth/refresh', () => jsonResponse(401, errorBodies.reauth));
    const result = track(refresher.refresh('refresh-1'));
    await clock.advance(0);
    expect(result.value).toEqual({ kind: 'reauthentication_required' });
  });

  it('TC-NET-023 TC-NET-029 네트워크 오류는 transient_failure이고 자동 재시도하지 않는다(같은 refresh token을 두 번 보내지 않는다)', async () => {
    const { clock, ff, refresher } = setup();
    ff.route('POST /auth/refresh', networkFailure);
    const result = track(refresher.refresh('refresh-1'));
    await clock.advance(30_000);
    expect(result.value?.kind).toBe('transient_failure');
    expect(ff.calls).toHaveLength(1);
  });

  it('TC-NET-023 타임아웃(15초)도 transient_failure이고 재시도하지 않는다', async () => {
    const { clock, ff, refresher } = setup();
    ff.route('POST /auth/refresh', () => new Promise<Response>(() => {}));
    const result = track(refresher.refresh('refresh-1'));
    await clock.advance(60_000);
    expect(result.value?.kind).toBe('transient_failure');
    expect(ff.calls).toHaveLength(1);
  });

  it('TC-NET-024 5xx는 transient_failure이고 재시도하지 않는다', async () => {
    const { clock, ff, refresher } = setup();
    ff.route('POST /auth/refresh', () => jsonResponse(500, errorBodies.internal500));
    const result = track(refresher.refresh('refresh-1'));
    await clock.advance(30_000);
    expect(result.value?.kind).toBe('transient_failure');
    expect(ff.calls).toHaveLength(1);
  });

  it.each([
    ['refreshToken 누락', { accessToken: 'a', expiresIn: 900, refreshTokenExpiresIn: 10 }],
    ['accessToken 누락', { expiresIn: 900, refreshToken: 'r', refreshTokenExpiresIn: 10 }],
    ['expiresIn 타입 오류', { accessToken: 'a', expiresIn: '900', refreshToken: 'r', refreshTokenExpiresIn: 10 }],
  ])('TC-NET-025 200이어도 %s이면 transient_failure다(기존 세션을 덮어쓰지 않도록)', async (_n, body) => {
    const { clock, ff, refresher } = setup();
    ff.route('POST /auth/refresh', () => jsonResponse(200, body));
    const result = track(refresher.refresh('refresh-1'));
    await clock.advance(0);
    expect(result.value?.kind).toBe('transient_failure');
  });

  it('TC-NET-025 깨진 JSON·빈 본문 200도 transient_failure다', async () => {
    const { clock, ff, refresher } = setup();
    ff.route('POST /auth/refresh', () => new Response('{broken', { status: 200, headers: { 'content-type': 'application/json' } }), () => emptyResponse(200));
    const a = track(refresher.refresh('refresh-1'));
    await clock.advance(0);
    const b = track(refresher.refresh('refresh-1'));
    await clock.advance(0);
    expect(a.value?.kind).toBe('transient_failure');
    expect(b.value?.kind).toBe('transient_failure');
  });

  it('TC-NET-026 400은 클라이언트 버그로 error 로그를 남기고 transient_failure로 돌려준다(로그아웃 아님)', async () => {
    const { clock, ff, logger, refresher } = setup();
    ff.route('POST /auth/refresh', () => jsonResponse(400, errorBodies.business400));
    const result = track(refresher.refresh('refresh-1'));
    await clock.advance(0);
    expect(result.value?.kind).toBe('transient_failure');
    expect(logger.entries.some((e) => e.level === 'error')).toBe(true);
    expect(logger.dump()).not.toContain('refresh-1');
  });
});
