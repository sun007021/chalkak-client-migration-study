import { reauth, unauthorized } from '../../core/http/__testing__/createNetHarness';
import { networkFailure } from '../../core/http/__testing__/FakeTransport';
import type { RouteValue } from '../../data/__testing__/FixtureRouter';
import { t } from '../../shared/copy';
import {
  countOf,
  createUploadHarness,
  flush,
  TOPIC_DATE,
  TOPIC_ID,
  TOPIC_TITLE,
} from './__testing__/createUploadHarness';
import { pickAndConfirm } from './__testing__/uploadFlow';

const TOPICS = 'GET /topics?date=2026-10-27';

async function setup(routes: Record<string, RouteValue> = {}) {
  return createUploadHarness({ routes });
}

describe('PhotoUploadViewModel - 주제', () => {
  it('TC-UPL-088 start는 screen_view photo_upload를 한 번만 보낸다(여러 번 불러도)', async () => {
    const h = await setup();
    await h.viewModel.start();
    await h.viewModel.start();
    expect(h.analytics.screenNames).toEqual(['photo_upload']);
    expect(countOf(h, TOPICS)).toBe(1);
  });

  it('TC-UPL-011 GET /topics?date=<topicDate>로 topicId와 제목을 얻는다', async () => {
    const h = await setup();
    const loading = h.viewModel.getSnapshot().topic;
    expect(loading).toEqual({ status: 'loading' });

    await h.viewModel.start();
    expect(h.viewModel.getSnapshot().topic).toEqual({
      status: 'ready',
      id: TOPIC_ID,
      title: TOPIC_TITLE,
    });
    expect(h.router.calls(TOPICS)).toHaveLength(1);
  });

  it('TC-UPL-011 응답 topicDate가 요청과 다르면 주제 불러오기 실패다', async () => {
    const h = await setup({ [TOPICS]: 'upload/topics__mismatch-date' });
    await h.viewModel.start();
    expect(h.viewModel.getSnapshot().topic).toEqual({
      status: 'error',
      message: t('upload.error.topic-load'),
    });
  });

  it.each([
    ['404', 'home/topics__404-not-found', t('upload.error.topic-load')],
    ['500', 'upload/topics__500-server-error', t('upload.error.topic-load')],
  ] as [string, RouteValue, string][])(
    'TC-UPL-012 %s는 주제 불러오기 실패 문구다',
    async (_n, route, message) => {
      const h = await setup({ [TOPICS]: route });
      await h.viewModel.start();
      expect(h.viewModel.getSnapshot().topic).toEqual({ status: 'error', message });
    },
  );

  it('TC-UPL-012 연결 실패는 네트워크 문구다', async () => {
    const h = await setup({ [TOPICS]: networkFailure() });
    await h.viewModel.start();
    expect(h.viewModel.getSnapshot().topic).toEqual({
      status: 'error',
      message: t('upload.error.network'),
    });
  });

  it('TC-UPL-012 401은 재인증이다: 세션 만료는 로그인 이벤트에 맡기고 갱신 뒤 401은 로그인 화면으로 보낸다', async () => {
    const expired = await setup({ [TOPICS]: unauthorized(), 'POST /auth/refresh': reauth() });
    await expired.viewModel.start();
    expect(expired.authFlow.calls).toEqual([]);
    expect(expired.emitted).toHaveLength(1);

    const stillUnauthorized = await setup({ [TOPICS]: unauthorized() });
    await stillUnauthorized.viewModel.start();
    expect(stillUnauthorized.authFlow.calls).toEqual(['login']);
  });

  it('REQ-UPL-010 retryTopic은 주제만 다시 받는다(정책 발급 등 다른 요청 없음)', async () => {
    const h = await setup({
      [TOPICS]: [
        'upload/topics__500-server-error',
        'upload/topics__500-server-error',
        'upload/topics__500-server-error',
        'home/topics__open-2026-10-27',
      ],
    });
    await h.viewModel.start();
    expect(h.viewModel.getSnapshot().topic.status).toBe('error');

    await h.viewModel.retryTopic();
    expect(h.viewModel.getSnapshot().topic).toMatchObject({ status: 'ready', id: TOPIC_ID });
    expect(countOf(h, 'POST /posts/uploads')).toBe(0);
    expect(h.analytics.screenNames).toEqual(['photo_upload']);
  });

  it('REQ-UPL-010 주제가 아직 없으면 제출할 수 없다(canSubmit=false)', async () => {
    const h = await setup({ [TOPICS]: 'upload/topics__500-server-error' });
    await h.viewModel.start();
    expect(h.viewModel.getSnapshot().canSubmit).toBe(false);
  });

  it('TC-UPL-013 진입 때 고정한 topicDate·topicId로 제출한다: 자정이 지나도 시계로 다시 계산하지 않는다', async () => {
    const h = await setup();
    h.clock.set('2026-10-27T14:59:30Z'); // KST 23:59:30
    await h.viewModel.start();
    await pickAndConfirm(h);

    h.clock.set('2026-10-27T15:01:00Z'); // KST 00:01
    await h.viewModel.submit();
    await flush();

    expect(JSON.parse(h.router.calls('POST /posts')[0].body as string)).toMatchObject({
      topicId: TOPIC_ID,
    });
    expect(countOf(h, TOPICS)).toBe(1);
    expect(h.navigator.ofType('show-success')).toEqual([
      expect.objectContaining({ topicDate: TOPIC_DATE.toString(), topicTitle: TOPIC_TITLE }),
    ]);
  });

  it('TC-UPL-087 요청에는 yyyy-MM-dd, 성공 화면에는 고정한 KstDate가 넘어간다(기기 시간대와 무관)', async () => {
    const h = await setup();
    await h.viewModel.start();
    expect(h.router.calls(TOPICS)[0].url).toContain('date=2026-10-27');
  });
});
