import { ApiError, InvalidResponseError, NetworkError, isCancellation } from '../../core/net/errors';
import { AI_POST_ID, aiGet, aiPost, createAiHarness, getFx, postFx } from '../../test/aiReviewHarness';
import { json } from '../../test/fixtureRouter';
import { loadFixture } from '../../test/fixtures';

interface Body {
  status: string;
  result: { overallScore: number | string; criteria: { key: string; label: string; score: number }[]; distinctivePerspective: boolean; feedback: Record<string, string> };
}

/** ai-review fixture 본문을 고쳐 만든 응답(계약 위반 재현). */
function variant(name: string, change: (body: Body) => void): Response {
  const body = structuredClone(loadFixture(`${getFx(name)}.json`).json) as Body;
  change(body);
  return json(200, body);
}

describe('AiReviewRepository 요청 (TC-AIR-001, 008, 009)', () => {
  it('TC-AIR-001 GET·POST는 같은 경로와 Authorization을 쓰고 본문을 보내지 않는다', async () => {
    const h = createAiHarness({ routes: { [aiPost()]: postFx('202-processing') } });
    await h.repository.fetchReview(AI_POST_ID);
    await h.repository.requestReview(AI_POST_ID);
    const [get] = h.router.calls(aiGet());
    const [post] = h.router.calls(aiPost());
    expect(get!.path).toBe(`/posts/${AI_POST_ID}/ai-review`);
    expect(post!.path).toBe(get!.path);
    expect(get!.method).toBe('GET');
    expect(post!.method).toBe('POST');
    expect(get!.headers['authorization']).toBe('Bearer fixture-access-token-1');
    expect(post!.headers['authorization']).toBe(get!.headers['authorization']);
    expect(get!.body).toBeNull();
    expect(post!.body).toBeNull();
  });

  it('TC-AIR-001 D-21 POST는 연결 실패에도 자동으로 다시 보내지 않는다', async () => {
    const h = createAiHarness({
      routes: {
        [aiPost()]: () => {
          throw new TypeError('Failed to fetch');
        },
      },
    });
    await expect(h.repository.requestReview(AI_POST_ID)).rejects.toBeInstanceOf(NetworkError);
    await h.clock.advance(5_000);
    expect(h.router.calls(aiPost())).toHaveLength(1);
  });

  it('TC-AIR-008 POST는 202 PROCESSING과 200 COMPLETED를 모두 정상으로 읽고 HTTP 코드가 아니라 본문 status로 해석한다', async () => {
    const h = createAiHarness({ routes: { [aiPost()]: [postFx('202-processing'), postFx('200-completed')] } });
    await expect(h.repository.requestReview(AI_POST_ID)).resolves.toMatchObject({ status: 'PROCESSING', result: null, canRequestAgain: false });
    const completed = await h.repository.requestReview(AI_POST_ID);
    expect(completed.status).toBe('COMPLETED');
    expect(completed.result?.overallScore).toBe(7.5);
  });

  it.each([
    ['400 한도 초과', postFx('400-limit-reached'), 400, '더 이상 AI 리뷰를 다시 요청할 수 없습니다.'],
    ['400 비활성', postFx('400-disabled'), 400, '지금은 AI 리뷰를 요청할 수 없습니다.'],
    ['403 정지', postFx('403-banned'), 403, '차단된 회원입니다.'],
  ])('TC-AIR-009 %s: HTTP 상태와 서버 message를 그대로 보존한다', async (_name, fixture, status, message) => {
    const h = createAiHarness({ routes: { [aiPost()]: fixture } });
    const error = await h.repository.requestReview(AI_POST_ID).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, message });
  });

  it('TC-AIR-009 요청 취소는 통신 오류가 아니라 취소(AbortError)로 전해진다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: () => new Promise<Response>(() => undefined) } });
    const controller = new AbortController();
    const pending = h.repository.fetchReview(AI_POST_ID, controller.signal);
    controller.abort();
    const error = await pending.then(
      () => null,
      (e: unknown) => e,
    );
    expect(isCancellation(error)).toBe(true);
    expect(error).not.toBeInstanceOf(NetworkError);
  });
});

describe('AiReviewRepository 응답 읽기 (TC-AIR-002 ~ 007, REQ-AIR-042 ~ 045)', () => {
  it('TC-AIR-002 NONE: 상태와 canRequestAgain=false, 시각·result는 모두 null', async () => {
    const h = createAiHarness();
    await expect(h.repository.fetchReview(AI_POST_ID)).resolves.toEqual({ status: 'NONE', requestedAt: null, completedAt: null, result: null, canRequestAgain: false });
  });

  it('TC-AIR-003 COMPLETED: 점수·criteria·독특한 시각·feedback과 시각을 읽는다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('completed') } });
    await expect(h.repository.fetchReview(AI_POST_ID)).resolves.toEqual({
      status: 'COMPLETED',
      requestedAt: Date.parse('2026-10-27T02:58:00Z'),
      completedAt: Date.parse('2026-10-27T02:58:21Z'),
      canRequestAgain: false,
      result: {
        overallScore: 7.5,
        criteria: [{ key: 'COMPOSITION', label: '구도', score: 7.5 }],
        distinctivePerspective: true,
        feedback: {
          summary: '빛을 따라 시선이 흐르는 안정적인 구도',
          strength: '빛이 들어오는 방향을 따라 시선이 자연스럽게 이어집니다.',
          weakness: '수평선이 살짝 기울어 안정감이 조금 떨어집니다.',
          suggestion: '카메라를 낮추고 수평선을 맞춰 한 번 더 찍어 보세요.',
        },
      },
    });
  });

  it('TC-AIR-003 소수초가 있는 UTC 시각도 읽는다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('completed-fractional-seconds') } });
    await expect(h.repository.fetchReview(AI_POST_ID)).resolves.toMatchObject({
      requestedAt: Date.parse('2026-10-27T02:58:00.123Z'),
      completedAt: Date.parse('2026-10-27T02:58:21.123Z'),
    });
  });

  it('TC-AIR-003 TC-AIR-010 criteria는 개수를 고정하지 않고 응답 순서대로 읽는다(3개·상한 길이)', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('completed-long-text') } });
    const review = await h.repository.fetchReview(AI_POST_ID);
    expect(review.result?.criteria.map((c) => c.key)).toEqual(['COMPOSITION', 'LIGHT', 'SUBJECT']);
    expect(review.result?.feedback.summary).toHaveLength(60);
  });

  it('TC-AIR-004 COMPLETED인데 result가 null이면 잘못된 응답이다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('completed-no-result') } });
    await expect(h.repository.fetchReview(AI_POST_ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-AIR-005 점수가 10.1이면 잘못된 응답이고 0.0과 10.0은 유효하다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: [getFx('score-out-of-range'), getFx('completed-score-0'), getFx('completed-score-10')] } });
    await expect(h.repository.fetchReview(AI_POST_ID)).rejects.toBeInstanceOf(InvalidResponseError);
    await expect(h.repository.fetchReview(AI_POST_ID)).resolves.toMatchObject({ result: { overallScore: 0 } });
    await expect(h.repository.fetchReview(AI_POST_ID)).resolves.toMatchObject({ result: { overallScore: 10 } });
  });

  it.each([
    ['overallScore -0.1', (b: Body) => (b.result.overallScore = -0.1)],
    ['overallScore NaN(문자열)', (b: Body) => (b.result.overallScore = 'NaN')],
    ['criteria 점수 10.1', (b: Body) => (b.result.criteria[0]!.score = 10.1)],
    ['criteria 점수 -0.1', (b: Body) => (b.result.criteria[0]!.score = -0.1)],
  ])('TC-AIR-005 REQ-AIR-042 %s이면 응답 전체가 잘못된 응답이다', async (_name, change) => {
    const h = createAiHarness({ routes: { [aiGet()]: () => variant('completed', change) } });
    await expect(h.repository.fetchReview(AI_POST_ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-AIR-006 FAILED: result는 null이고 canRequestAgain은 서버 값 그대로이며 필드가 없으면 false다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: [getFx('failed-can-retry'), getFx('failed-cannot-retry'), getFx('missing-can-request-again')] } });
    await expect(h.repository.fetchReview(AI_POST_ID)).resolves.toMatchObject({ status: 'FAILED', result: null, canRequestAgain: true });
    await expect(h.repository.fetchReview(AI_POST_ID)).resolves.toMatchObject({ status: 'FAILED', result: null, canRequestAgain: false });
    await expect(h.repository.fetchReview(AI_POST_ID)).resolves.toMatchObject({ status: 'FAILED', result: null, canRequestAgain: false });
  });

  it('TC-AIR-007 알 수 없는 status는 잘못된 응답이다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('unknown-status') } });
    await expect(h.repository.fetchReview(AI_POST_ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it.each([
    ['PROCESSING인데 result가 있음', (b: Body) => (b.status = 'PROCESSING')],
    ['FAILED인데 result가 있음', (b: Body) => (b.status = 'FAILED')],
    ['NONE인데 result가 있음', (b: Body) => (b.status = 'NONE')],
  ])('TC-AIR-007 REQ-AIR-043 %s이면 잘못된 응답이다', async (_name, change) => {
    const h = createAiHarness({ routes: { [aiGet()]: () => variant('completed', change) } });
    await expect(h.repository.fetchReview(AI_POST_ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it.each(['summary', 'strength', 'weakness', 'suggestion'])('REQ-AIR-045 feedback.%s가 비어 있으면 잘못된 응답이다', async (field) => {
    const h = createAiHarness({ routes: { [aiGet()]: () => variant('completed', (b) => (b.result.feedback[field] = '')) } });
    await expect(h.repository.fetchReview(AI_POST_ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('GET 404는 ApiError로 던진다(저장소가 숨김으로 바꾼다)', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('404-not-found') } });
    await expect(h.repository.fetchReview(AI_POST_ID)).rejects.toMatchObject({ status: 404 });
  });
});
