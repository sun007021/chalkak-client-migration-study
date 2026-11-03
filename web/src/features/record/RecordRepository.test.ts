import { ApiError, InvalidResponseError } from '../../core/net/errors';
import { makeApiEnv } from '../../test/apiEnv';
import { json } from '../../test/fixtureRouter';
import { FixtureRouter } from '../../test/fixtureRouter';
import { errorBodies, guestSession, memberSession, refreshSuccessBody } from '../../test/fixtures';
import { finish } from '../../test/homeHarness';
import { track } from '../../test/track';
import { AUG, MONTHS_KEY, OCT, SEP, monthBody, recPostId } from '../../test/recordRoutes';
import { RecordRepository } from './RecordRepository';

function setup(session = memberSession(), routes: Record<string, Parameters<FixtureRouter['set']>[1]> = {}) {
  const env = makeApiEnv(session);
  const router = new FixtureRouter(env.ff, {
    [MONTHS_KEY]: 'record/posts-calendar-months__recent-first',
    [OCT]: 'record/posts-calendar__2026-10',
    [SEP]: 'record/posts-calendar__2026-09',
    [AUG]: 'record/posts-calendar__2026-08-empty',
    ...routes,
  });
  const repository = new RecordRepository({ api: env.client() });
  return { ...env, router, repository };
}

describe('RecordRepository 요청 (REQ-REC-001, 017, 041)', () => {
  it('TC-REC-001 GET /posts/calendar/months를 인증 헤더와 함께 부르고 연월 목록을 돌려준다', async () => {
    const h = setup();
    const result = await finish(h, h.repository.fetchMonths());
    expect(result).toEqual([
      { year: 2026, month: 10 },
      { year: 2026, month: 9 },
    ]);
    const [call] = h.ff.callsTo('GET /posts/calendar/months');
    expect(call!.headers['authorization']).toBe('Bearer fixture-access-token-1');
    expect(h.ff.calls).toHaveLength(1);
  });

  it('TC-REC-001 GET /posts/calendar?year=2026&month=10을 보내고 응답을 CalendarMonth로 돌려준다', async () => {
    const h = setup();
    const month = await finish(h, h.repository.fetchMonth({ year: 2026, month: 10 }));
    const [call] = h.ff.callsTo('GET /posts/calendar');
    expect(Object.fromEntries(call!.query)).toEqual({ year: '2026', month: '10' });
    expect(call!.headers['authorization']).toBe('Bearer fixture-access-token-1');
    expect(month).toMatchObject({ year: 2026, month: 10 });
    expect(month.posts.map((p) => [p.topicDate, p.status])).toEqual([
      ['2026-10-20', 'APPROVED'],
      ['2026-10-27', 'PENDING'],
      ['2026-10-31', 'APPROVED'],
    ]);
    expect(month.posts[1]).toEqual({
      topicDate: '2026-10-27',
      postId: recPostId(201),
      thumbnailImageUrl: 'https://cdn.example.test/posts/22222222-2222-4222-8222-222222222201/thumbnail.webp',
      status: 'PENDING',
    });
  });
});

describe('월 목록 정리 (TC-REC-002)', () => {
  it('TC-REC-002 응답이 비어(`[]`) 있어도 오류 없이 빈 배열이다', async () => {
    const h = setup(memberSession(), { [MONTHS_KEY]: 'record/posts-calendar-months__empty' });
    await expect(finish(h, h.repository.fetchMonths())).resolves.toEqual([]);
  });

  it('TC-REC-002 순서가 뒤섞이거나 중복된 응답도 최신순·중복 없이 돌려준다', async () => {
    const h = setup(memberSession(), {
      [MONTHS_KEY]: () =>
        json(200, {
          months: [
            { year: 2025, month: 3 },
            { year: 2026, month: 9 },
            { year: 2026, month: 10 },
            { year: 2026, month: 9 },
          ],
        }),
    });
    await expect(finish(h, h.repository.fetchMonths())).resolves.toEqual([
      { year: 2026, month: 10 },
      { year: 2026, month: 9 },
      { year: 2025, month: 3 },
    ]);
  });

  it('TC-REC-002 연도를 건너뛴 다년 목록도 최신순이다', async () => {
    const h = setup(memberSession(), { [MONTHS_KEY]: 'record/posts-calendar-months__multi-year' });
    const months = await finish(h, h.repository.fetchMonths());
    expect(months.map((m) => `${m.year}-${m.month}`)).toEqual(['2026-10', '2026-9', '2025-12', '2025-3']);
  });

  it('REQ-REC-018 월 값이 범위 밖(0, 13)이면 계약 위반이다', async () => {
    const h = setup(memberSession(), { [MONTHS_KEY]: () => json(200, { months: [{ year: 2026, month: 13 }] }) });
    await expect(finish(h, h.repository.fetchMonths())).rejects.toBeInstanceOf(InvalidResponseError);
  });
});

describe('월 응답 검증 (REQ-REC-018)', () => {
  it('TC-REC-012 응답 month가 요청과 다르면 InvalidResponseError다', async () => {
    const h = setup(memberSession(), { [OCT]: 'record/posts-calendar__month-mismatch' });
    await expect(finish(h, h.repository.fetchMonth({ year: 2026, month: 10 }))).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-REC-012 응답 year가 요청과 다르면 InvalidResponseError다', async () => {
    const h = setup(memberSession(), { [OCT]: () => json(200, monthBody(2025, 10)) });
    await expect(finish(h, h.repository.fetchMonth({ year: 2026, month: 10 }))).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it.each([
    ['날짜가 그 달 밖', 'record/posts-calendar__date-out-of-month'],
    ['같은 날짜가 중복', 'record/posts-calendar__duplicate-date'],
    ['썸네일 URL이 빈 문자열', 'record/posts-calendar__empty-thumbnail'],
  ])('TC-REC-013 %s이면 InvalidResponseError로 처리한다', async (_name, fixture) => {
    const h = setup(memberSession(), { [OCT]: fixture });
    await expect(finish(h, h.repository.fetchMonth({ year: 2026, month: 10 }))).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-REC-013 형식이 틀린 날짜·필드 누락도 InvalidResponseError다', async () => {
    const bad = (post: Record<string, unknown>) => () => json(200, { year: 2026, month: 10, posts: [post] });
    const base = { topicDate: '2026-10-20', postId: recPostId(290), thumbnailImageUrl: 'https://cdn.example.test/a.webp', status: 'APPROVED' };
    for (const post of [{ ...base, topicDate: '2026-10-32' }, { ...base, topicDate: 'garbage' }, { ...base, postId: undefined }, { ...base, thumbnailImageUrl: undefined }]) {
      const h = setup(memberSession(), { [OCT]: bad(post) });
      await expect(finish(h, h.repository.fetchMonth({ year: 2026, month: 10 })), JSON.stringify(post)).rejects.toBeInstanceOf(InvalidResponseError);
    }
  });

  it('TC-REC-014 status가 REJECTED 또는 알 수 없는 값이면 응답 전체를 계약 위반으로 본다(REQ-REC-018, 확인 필요: 카탈로그 쟁점 1과의 차이)', async () => {
    const h = setup(memberSession(), { [OCT]: 'record/posts-calendar__unknown-status' });
    await expect(finish(h, h.repository.fetchMonth({ year: 2026, month: 10 }))).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-REC-014 앱이 깨지지 않도록 던지는 것은 InvalidResponseError뿐이다(TypeError·RangeError가 아니다)', async () => {
    const h = setup(memberSession(), { [OCT]: () => json(200, { year: 2026, month: 10, posts: 'nope' }) });
    const error = await finish(h, h.repository.fetchMonth({ year: 2026, month: 10 })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidResponseError);
  });

  it('TC-REC-015 응답 배열이 날짜 오름차순이 아니어도 topicDate 오름차순으로 돌려준다', async () => {
    const h = setup(memberSession(), { [OCT]: 'record/posts-calendar__2026-10-shuffled' });
    const month = await finish(h, h.repository.fetchMonth({ year: 2026, month: 10 }));
    expect(month.posts.map((p) => p.topicDate)).toEqual(['2026-10-20', '2026-10-27', '2026-10-31']);
  });

  it('REQ-REC-020 posts가 빈 달은 오류가 아니라 빈 배열이다', async () => {
    const h = setup();
    const month = await finish(h, h.repository.fetchMonth({ year: 2026, month: 8 }));
    expect(month).toEqual({ year: 2026, month: 8, posts: [] });
  });

  it('REQ-REC-011 앱 안에서 쓰는 날짜는 서버가 준 topicDate 문자열 그대로다(시간대 변환 없음)', async () => {
    const h = setup(memberSession(), { [OCT]: () => json(200, monthBody(2026, 10, [['2026-10-31', recPostId(291), 'APPROVED']])) });
    const month = await finish(h, h.repository.fetchMonth({ year: 2026, month: 10 }));
    expect(month.posts[0]!.topicDate).toBe('2026-10-31');
  });
});

describe('쿼리 범위와 오류 (REQ-REC-017, TC-REC-031)', () => {
  it.each([
    [{ year: 0, month: 1 }],
    [{ year: 10000, month: 1 }],
    [{ year: 2026, month: 0 }],
    [{ year: 2026, month: 13 }],
    [{ year: 2026.5, month: 1 }],
    [{ year: 2026, month: Number.NaN }],
  ])('TC-REC-031 범위 밖 값 %j은 요청 없이 RangeError로 거절한다', async (ym) => {
    const h = setup();
    await expect(h.repository.fetchMonth(ym)).rejects.toBeInstanceOf(RangeError);
    expect(h.ff.calls).toHaveLength(0);
  });

  it.each([
    [{ year: 1, month: 1 }, '1', '1'],
    [{ year: 9999, month: 12 }, '9999', '12'],
  ])('TC-REC-031 경계 값 %j은 그대로 보낸다', async (ym, year, month) => {
    const h = setup(memberSession(), { [`GET /posts/calendar?year=${year}&month=${month}`]: () => json(200, monthBody(ym.year, ym.month)) });
    await finish(h, h.repository.fetchMonth(ym));
    expect(Object.fromEntries(h.ff.callsTo('GET /posts/calendar')[0]!.query)).toEqual({ year, month });
  });

  it('TC-REC-031 서버 400(조회 연월이 올바르지 않습니다)은 status 400 ApiError로 전달한다(분기는 호출한 API와 상태로)', async () => {
    const h = setup(memberSession(), { [OCT]: 'record/posts-calendar__400-invalid-month' });
    const result = track(h.repository.fetchMonth({ year: 2026, month: 10 }));
    await h.clock.advance(0);
    expect(result.error).toBeInstanceOf(ApiError);
    expect(result.error).toMatchObject({ status: 400 });
    expect(h.ff.callsTo('GET /posts/calendar')).toHaveLength(1);
  });

  it('TC-REC-032 서버 500은 읽기 GET의 자동 재시도(0.5초, 1초, 최대 2회, D-21) 뒤 ApiError 500이다', async () => {
    const h = setup(memberSession(), { [OCT]: 'record/posts-calendar__500-server-error' });
    const error = await finish(h, h.repository.fetchMonth({ year: 2026, month: 10 })).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 500, errorCode: 'INTERNAL_ERROR' });
    expect(h.ff.callsTo('GET /posts/calendar')).toHaveLength(3);
  });

  it('TC-REC-030 401 UNAUTHORIZED면 refresh 후 1회 재전송해 성공한다', async () => {
    const h = setup(memberSession(), {
      [OCT]: (req) => (req.headers['authorization'] === 'Bearer fixture-access-token-2' ? json(200, monthBody(2026, 10)) : json(401, errorBodies.unauthorized)),
    });
    h.ff.route('POST /auth/refresh', () => json(200, refreshSuccessBody));
    const month = await finish(h, h.repository.fetchMonth({ year: 2026, month: 10 }));
    expect(month.posts).toEqual([]);
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(1);
    expect(h.ff.callsTo('GET /posts/calendar').map((c) => c.headers['authorization'])).toEqual(['Bearer fixture-access-token-1', 'Bearer fixture-access-token-2']);
  });

  it('TC-REC-030 refresh가 REAUTHENTICATION_REQUIRED면 세션 만료 이벤트가 한 번 나고 401로 실패한다', async () => {
    const h = setup(memberSession(), { [OCT]: 'record/posts-calendar__401-unauthorized' });
    h.ff.route('POST /auth/refresh', () => json(401, errorBodies.reauth));
    const error = await finish(h, h.repository.fetchMonth({ year: 2026, month: 10 })).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 401, errorCode: 'REAUTHENTICATION_REQUIRED' });
    expect(h.expired.count).toBe(1);
  });

  it('TC-REC-030 토큰이 없는 상태의 401은 refresh하지 않고 401 ApiError다(직접 진입)', async () => {
    const h = setup(guestSession, { [OCT]: 'record/posts-calendar__401-unauthorized' });
    const error = await finish(h, h.repository.fetchMonth({ year: 2026, month: 10 })).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 401, errorCode: 'UNAUTHORIZED' });
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(0);
  });
});
