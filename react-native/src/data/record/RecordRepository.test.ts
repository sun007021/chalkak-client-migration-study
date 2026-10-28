import {
  HttpError,
  InvalidResponseError,
  ReauthenticationRequiredError,
} from '../../core/http/ApiError';
import {
  createNetHarness,
  reauth,
  refreshOk,
  unauthorized,
} from '../../core/http/__testing__/createNetHarness';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { YearMonth } from '../../core/time/YearMonth';
import { FixtureRouter } from '../__testing__/FixtureRouter';
import { authorizationOf, pathOf, queryOf } from '../__testing__/requestAsserts';
import { RecordRepository } from './RecordRepository';

const OCT = YearMonth.of(2026, 10);

function setup() {
  const net = createNetHarness();
  return { ...net, repository: new RecordRepository({ api: net.api }) };
}

const ymds = (posts: readonly { date: { toString(): string } }[]) =>
  posts.map((p) => p.date.toString());

describe('RecordRepository.getMonths', () => {
  it('TC-REC-001 GET /posts/calendar/months를 토큰과 함께 부른다', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse('record/posts-calendar-months__recent-first'));
    const months = await h.repository.getMonths();
    const request = h.transport.requests[0];
    expect(request.method).toBe('GET');
    expect(pathOf(request)).toBe('/posts/calendar/months');
    expect(authorizationOf(request)).toBe('Bearer access-1');
    expect(months.map((m) => m.toString())).toEqual(['2026-10', '2026-09']);
  });

  it('TC-REC-002 응답이 비어 있어도 오류 없이 빈 배열이다', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse('record/posts-calendar-months__empty'));
    await expect(h.repository.getMonths()).resolves.toEqual([]);
  });

  it('TC-REC-002 순서가 뒤섞이거나 중복이어도 최신순·중복 없음으로 돌려준다', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script({
      status: 200,
      headers: { 'content-type': 'application/json' },
      bodyText: JSON.stringify({
        months: [
          { year: 2025, month: 12 },
          { year: 2026, month: 9 },
          { year: 2026, month: 10 },
          { year: 2026, month: 9 },
        ],
      }),
    });
    const months = await h.repository.getMonths();
    expect(months.map((m) => m.toString())).toEqual(['2026-10', '2026-09', '2025-12']);
  });

  it('TC-REC-018 여러 해의 월 목록을 그대로 해석한다', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse('record/posts-calendar-months__multi-year'));
    const months = await h.repository.getMonths();
    expect(months.map((m) => m.toString())).toEqual(['2026-10', '2026-09', '2025-12', '2025-03']);
  });
});

describe('RecordRepository.getCalendar', () => {
  it('TC-REC-001 TC-REC-031 year/month 쿼리를 보내고 사진을 날짜 오름차순으로 해석한다', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse('record/posts-calendar__2026-10'));
    const month = await h.repository.getCalendar(OCT);
    const request = h.transport.requests[0];
    expect(pathOf(request)).toBe('/posts/calendar');
    expect(queryOf(request)).toEqual({ year: '2026', month: '10' });
    expect(authorizationOf(request)).toBe('Bearer access-1');
    expect(month.month.toString()).toBe('2026-10');
    expect(month.photos.map((p) => [p.date.toString(), p.status])).toEqual([
      ['2026-10-20', 'APPROVED'],
      ['2026-10-27', 'PENDING'],
      ['2026-10-31', 'APPROVED'],
    ]);
    expect(month.photos[0].thumbnailUrl).toContain('/thumbnail.webp');
  });

  it('TC-REC-031 연은 1~9999, 월은 1~12 범위의 값만 보낸다', async () => {
    const h = setup();
    await h.signIn();
    h.transport.respond((request) => {
      const q = queryOf(request);
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        bodyText: JSON.stringify({ year: Number(q.year), month: Number(q.month), posts: [] }),
      };
    });
    await h.repository.getCalendar(YearMonth.of(1, 1));
    await h.repository.getCalendar(YearMonth.of(9999, 12));
    expect(h.transport.requests.map((r) => queryOf(r))).toEqual([
      { year: '1', month: '1' },
      { year: '9999', month: '12' },
    ]);
    expect(() => YearMonth.of(10000, 1)).toThrow();
    expect(() => YearMonth.of(2026, 13)).toThrow();
  });

  it('TC-REC-008 주제 날짜 문자열 그대로 칸을 정한다(10/31은 10월에 남는다)', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse('record/posts-calendar__2026-10'));
    const month = await h.repository.getCalendar(OCT);
    expect(ymds(month.photos)).toContain('2026-10-31');
    expect(month.photos.every((p) => p.date.month === 10)).toBe(true);
  });

  it('TC-REC-015 응답 순서가 달라도 날짜 오름차순으로 돌려준다', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse('record/posts-calendar__2026-10-shuffled'));
    const month = await h.repository.getCalendar(OCT);
    expect(ymds(month.photos)).toEqual(['2026-10-20', '2026-10-27', '2026-10-31']);
  });

  it('TC-REC-020 빈 달(posts: [])은 오류가 아니다', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse('record/posts-calendar__2026-08-empty'));
    const month = await h.repository.getCalendar(YearMonth.of(2026, 8));
    expect(month.photos).toEqual([]);
  });

  it('TC-REC-012 응답 month가 요청과 다르면 InvalidResponseError다', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse('record/posts-calendar__month-mismatch'));
    await expect(h.repository.getCalendar(OCT)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it.each([
    ['date-out-of-month', '날짜가 그 달 밖'],
    ['duplicate-date', '같은 날짜 중복'],
    ['empty-thumbnail', '썸네일 URL이 빈 문자열'],
  ])('TC-REC-013 %s(%s)이면 InvalidResponseError다', async (name) => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse(`record/posts-calendar__${name}`));
    await expect(h.repository.getCalendar(OCT)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-REC-014 REJECTED·알 수 없는 status는 깨지지 않고 해당 날짜 항목을 버린다 [가정]', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse('record/posts-calendar__unknown-status'));
    const month = await h.repository.getCalendar(OCT);
    expect(ymds(month.photos)).toEqual(['2026-10-20']);
  });

  it('TC-REC-031 400 BUSINESS_ERROR는 HttpError(400)다(message로 분기하지 않는다)', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse('record/posts-calendar__400-invalid-month'));
    await expect(h.repository.getCalendar(OCT)).rejects.toMatchObject({
      status: 400,
      errorCode: 'BUSINESS_ERROR',
    });
  });

  it('TC-REC-032 500은 HttpError(500)다', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse('record/posts-calendar__500-server-error'));
    const error = await h.repository.getCalendar(OCT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(500);
  });

  it('TC-REC-030 401 UNAUTHORIZED면 refresh 1회 뒤 원 요청을 1회 재전송해 성공한다', async () => {
    const h = setup();
    await h.signIn();
    const router = new FixtureRouter({
      'GET /posts/calendar': [unauthorized(), fixtureResponse('record/posts-calendar__2026-10')],
      'POST /auth/refresh': refreshOk(),
    }).install(h.transport);
    await expect(h.repository.getCalendar(OCT)).resolves.toMatchObject({
      month: { year: 2026, month: 10 },
    });
    expect(router.calls('POST /auth/refresh')).toHaveLength(1);
    const calls = router.calls('GET /posts/calendar');
    expect(calls).toHaveLength(2);
    expect(authorizationOf(calls[1])).toBe('Bearer access-2');
  });

  it('TC-REC-030 refresh가 REAUTHENTICATION_REQUIRED면 ReauthenticationRequiredError다', async () => {
    const h = setup();
    await h.signIn();
    new FixtureRouter({
      'GET /posts/calendar/months': unauthorized(),
      'POST /auth/refresh': reauth(),
    }).install(h.transport);
    await expect(h.repository.getMonths()).rejects.toBeInstanceOf(ReauthenticationRequiredError);
  });
});
