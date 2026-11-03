import { ApiError, InvalidResponseError, NetworkError } from '../../core/net/errors';
import { makeApiEnv } from '../../test/apiEnv';
import { networkFailure } from '../../test/fakeFetch';
import { loadFixture, memberSession } from '../../test/fixtures';
import { track } from '../../test/track';
import { FeedbackRepository } from './FeedbackRepository';

function setup() {
  const env = makeApiEnv(memberSession());
  return { ...env, repo: new FeedbackRepository({ api: env.client() }) };
}
const respond = (fixture: string) => () => loadFixture(fixture).toResponse();

describe('FeedbackRepository.submit', () => {
  it('TC-FDBK-015 POST /feedbacks, JSON 바디 {content}만, Bearer, Content-Type application/json이다', async () => {
    const { ff, repo } = setup();
    ff.route('POST /feedbacks', respond('feedback/feedbacks__created.json'));
    await repo.submit('앱이 좋아요');
    const call = ff.calls[0]!;
    expect(call.method).toBe('POST');
    expect(call.path).toBe('/feedbacks');
    expect(call.headers['authorization']).toBe('Bearer fixture-access-token-1');
    expect(call.headers['content-type']).toContain('application/json');
    expect(JSON.parse(call.body as string)).toEqual({ content: '앱이 좋아요' });
  });

  it('REQ-FDBK-007 Q-13 앱 버전·기기 정보 등 다른 필드는 보내지 않는다', async () => {
    const { ff, repo } = setup();
    ff.route('POST /feedbacks', respond('feedback/feedbacks__created.json'));
    await repo.submit('내용');
    expect(Object.keys(JSON.parse(ff.calls[0]!.body as string) as object)).toEqual(['content']);
  });

  it('TC-FDBK-012 content는 받은 값 그대로 보낸다(중간 개행·연속 공백 보존, trim은 호출자 몫)', async () => {
    const { ff, repo } = setup();
    ff.route('POST /feedbacks', respond('feedback/feedbacks__created.json'));
    await repo.submit('첫 줄\n\n둘째    줄');
    expect(JSON.parse(ff.calls[0]!.body as string)).toEqual({ content: '첫 줄\n\n둘째    줄' });
  });

  it('TC-FDBK-016 201 응답의 feedbackId와 createdAt(UTC Instant → epoch ms)을 읽는다', async () => {
    const { ff, repo } = setup();
    ff.route('POST /feedbacks', respond('feedback/feedbacks__created.json'));
    expect(await repo.submit('내용')).toEqual({ feedbackId: '12121212-1212-4121-8121-121212121201', createdAt: Date.parse('2026-10-27T03:00:00Z') });
  });

  it('TC-FDBK-016 feedbackId가 없는 201은 InvalidResponseError이다', async () => {
    const { ff, repo } = setup();
    ff.route('POST /feedbacks', () => Response.json({ createdAt: '2026-10-27T03:00:00Z' }, { status: 201 }));
    await expect(repo.submit('내용')).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it.each([
    ['feedbacks__bad-request-blank', 400, 'BUSINESS_ERROR'],
    ['feedbacks__bad-request-too-long', 400, 'BUSINESS_ERROR'],
  ])('TC-FDBK-021 %s는 ApiError(400 BUSINESS_ERROR)로 전달되고 재전송하지 않는다', async (name, status, errorCode) => {
    const { ff, clock, repo } = setup();
    ff.route('POST /feedbacks', respond(`feedback/${name}.json`));
    const result = track(repo.submit('x'));
    await clock.advance(5_000);
    expect(result.error).toBeInstanceOf(ApiError);
    expect(result.error).toMatchObject({ status, errorCode });
    expect(ff.calls).toHaveLength(1);
  });

  it('TC-FDBK-024 D-21 500이면 자동 재시도 없이 요청은 1회뿐이고 ApiError(500)이다', async () => {
    const { ff, clock, repo } = setup();
    ff.route('POST /feedbacks', respond('feedback/feedbacks__internal-error.json'));
    const result = track(repo.submit('x'));
    await clock.advance(10_000);
    expect(ff.calls).toHaveLength(1);
    expect(result.error).toMatchObject({ status: 500 });
  });

  it('TC-FDBK-025 D-21 연결 실패는 재시도 없이 NetworkError이다', async () => {
    const { ff, clock, repo } = setup();
    ff.route('POST /feedbacks', networkFailure);
    const result = track(repo.submit('x'));
    await clock.advance(10_000);
    expect(ff.calls).toHaveLength(1);
    expect(result.error).toBeInstanceOf(NetworkError);
  });

  it('TC-FDBK-027 503 Retry-After도 재시도 없이 ApiError(503)이다', async () => {
    const { ff, clock, repo } = setup();
    ff.route('POST /feedbacks', respond('common/error__service-unavailable-503.json'));
    const result = track(repo.submit('x'));
    await clock.advance(60_000);
    expect(ff.calls).toHaveLength(1);
    expect(result.error).toMatchObject({ status: 503 });
  });

  it('TC-FDBK-022 401 UNAUTHORIZED면 refresh 뒤 원 요청을 한 번 다시 보내 성공한다', async () => {
    const { ff, repo } = setup();
    ff.route('POST /feedbacks', respond('feedback/feedbacks__unauthorized.json'), respond('feedback/feedbacks__created.json'));
    ff.route('POST /auth/refresh', respond('auth/refresh__success.json'));
    await expect(repo.submit('내용')).resolves.toMatchObject({ feedbackId: '12121212-1212-4121-8121-121212121201' });
    const calls = ff.callsTo('POST /feedbacks');
    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[1]!.body as string)).toEqual({ content: '내용' });
  });

  it('TC-FDBK-023 REAUTHENTICATION_REQUIRED면 재전송 없이 실패하고 세션 만료를 알린다', async () => {
    const { ff, repo, expired } = setup();
    ff.route('POST /feedbacks', respond('feedback/feedbacks__unauthorized.json'));
    ff.route('POST /auth/refresh', respond('auth/refresh__reauthentication-required.json'));
    await expect(repo.submit('내용')).rejects.toMatchObject({ status: 401 });
    expect(ff.callsTo('POST /feedbacks')).toHaveLength(1);
    expect(expired.count).toBe(1);
  });

  it('TC-FDBK-028 REQ-FDBK-013 정지 회원 여부와 상관없이 201이면 성공이다(별도 분기 없음)', async () => {
    const { ff, repo } = setup();
    ff.route('POST /feedbacks', respond('feedback/feedbacks__created.json'));
    await expect(repo.submit('내용')).resolves.toBeDefined();
  });
});
