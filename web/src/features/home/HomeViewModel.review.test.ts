import { t } from '../../copy/ko';
import { deferred } from '../../test/deferred';
import { loadFixture } from '../../test/fixtures';
import { MY_POST_ID, TOPICS_TODAY, createHomeHarness, finish, settle } from '../../test/homeHarness';

const AI_GET = `GET /posts/${MY_POST_ID}/ai-review`;
const AI_POST = `POST /posts/${MY_POST_ID}/ai-review`;

describe('HomeViewModel AI 카드 보강 (D-08, 늦은 GET)', () => {
  it('D-08 TC-HOME-054 요청이 403이면 그 카드의 요청 버튼은 막히고(blocked) 다시 눌러도 요청은 늘지 않는다. 이후 갱신해도 막힘이 유지된다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    h.router.set(AI_POST, 'ai-review/ai-review-post__403-banned');
    await finish(h, h.viewModel.onAiRequestPress());
    expect(h.viewModel.state.ai).toMatchObject({ kind: 'ready', status: 'NONE', requesting: false, blocked: true });
    await finish(h, h.viewModel.onAiRequestPress());
    await finish(h, h.viewModel.onAiRequestPress());
    expect(h.router.calls(AI_POST)).toHaveLength(1);
    expect(h.toasts.messages).toEqual([t('ai.error.banned')]);

    await finish(h, h.viewModel.refresh()); // GET이 NONE을 다시 줘도 막힘은 그 카드에 남는다
    expect(h.viewModel.state.ai).toMatchObject({ status: 'NONE', blocked: true });
    await finish(h, h.viewModel.onAiRequestPress());
    expect(h.router.calls(AI_POST)).toHaveLength(1);
  });

  it('REQ-HOME-035 POST가 성공한 뒤 늦게 도착한 이전 GET(NONE)은 PROCESSING을 덮지 않는다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    const lateGet = deferred<void>();
    h.router.set(AI_GET, async () => {
      await lateGet.promise;
      return loadFixture('ai-review/ai-review-get__none.json').toResponse(); // POST 전에 나간 요청의 낡은 응답
    });
    const refreshing = h.viewModel.refresh();
    await settle();

    h.router.set(AI_POST, 'ai-review/ai-review-post__202-processing');
    await finish(h, h.viewModel.onAiRequestPress());
    expect(h.viewModel.state.ai).toMatchObject({ status: 'PROCESSING' });

    lateGet.resolve();
    await finish(h, refreshing);
    expect(h.viewModel.state.ai).toMatchObject({ status: 'PROCESSING', requesting: false });
  });
});

describe('HomeViewModel 인기 다시 시도의 요청 칸 (retryRanking)', () => {
  it('TC-HOME-020 인기만 다시 받아도 진행 중인 주제 요청을 취소하지 않는다(별도 요청 칸)', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    const gate = deferred<void>();
    h.router.set(TOPICS_TODAY, async () => {
      await gate.promise;
      return loadFixture('home/topics__open-2026-10-27.json').toResponse();
    });
    const refreshing = h.viewModel.refresh();
    await settle();
    const topicCall = h.router.calls(TOPICS_TODAY)[0]!;

    await finish(h, h.viewModel.retryRanking('popular'));
    expect(topicCall.signal?.aborted).toBe(false);
    gate.resolve();
    await finish(h, refreshing);
    expect(h.viewModel.state.topic.status).toBe('ready');
  });
});

describe('HomeViewModel 계정 전환 (resetForAccountChange)', () => {
  it('REQ-HOME-040 TC-HOME-044 보이고 있는 홈은 초기화 직후 곧바로 새로 불러오고, 이전 계정의 늦은 응답은 새 상태를 덮지 않는다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    const stale = deferred<void>();
    h.router.set(TOPICS_TODAY, async (_req, index) => {
      if (index === 0) {
        await stale.promise;
        return loadFixture('home/topics__404-not-found.json').toResponse(); // 이전 계정으로 나간 요청의 늦은 응답
      }
      return loadFixture('home/topics__open-2026-10-27.json').toResponse();
    });
    const old = h.viewModel.refresh();
    await settle();

    h.viewModel.resetForAccountChange();
    expect(h.viewModel.state.topic).toEqual({ status: 'loading' });
    await settle();
    await finish(h, h.viewModel.refresh().then(() => undefined));
    stale.resolve();
    await finish(h, old);
    await settle();
    expect(h.viewModel.state.topic).toMatchObject({ status: 'ready', topic: { title: '가을 하늘' } });
  });

  it('홈이 보이지 않으면 초기화만 하고 요청하지 않는다. 다시 보이면 불러온다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    h.viewModel.onHidden();
    const before = h.ff.calls.length;
    h.viewModel.resetForAccountChange();
    await settle();
    expect(h.ff.calls).toHaveLength(before);
    expect(h.viewModel.state.hero).toEqual({ kind: 'loading' });
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.hero.kind).toBe('photo');
  });

  it('진행 중이던 AI 요청의 결과는 새 계정 상태에 반영되지 않고, 새 계정에서는 다시 요청할 수 있다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    const gate = deferred<void>();
    h.router.set(AI_POST, async () => {
      await gate.promise;
      return loadFixture('ai-review/ai-review-post__202-processing.json').toResponse();
    });
    const requesting = h.viewModel.onAiRequestPress();
    await settle();
    expect(h.viewModel.state.ai).toMatchObject({ requesting: true });

    h.viewModel.resetForAccountChange();
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.ai).toMatchObject({ status: 'NONE', requesting: false });

    gate.resolve();
    await finish(h, requesting);
    expect(h.viewModel.state.ai).toMatchObject({ status: 'NONE', requesting: false });
    expect(h.toasts.messages).toEqual([]);

    h.router.set(AI_POST, 'ai-review/ai-review-post__202-processing');
    await finish(h, h.viewModel.onAiRequestPress()); // aiRequestInFlight가 이전 요청 때문에 남지 않았다
    expect(h.viewModel.state.ai).toMatchObject({ status: 'PROCESSING' });
  });
});

describe('HomeViewModel 배너 센티넬', () => {
  it('TC-BANR-012 센티넬이 보이면 다음 배너 페이지를 받고, 추가 실패 뒤에는 retryBannerMore가 같은 페이지를 다시 받는다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    h.router.set('GET /banners?page=2&pageSize=10', 'banner/banners__500-server-error');
    await finish(h, h.viewModel.onBannerSentinelVisible());
    expect(h.banners.state).toMatchObject({ status: 'ready', moreFailed: true });
    h.router.set('GET /banners?page=2&pageSize=10', 'banner/banners__page2-last');
    await finish(h, h.viewModel.retryBannerMore());
    expect(h.banners.state).toMatchObject({ status: 'ready', moreFailed: false, hasNext: false });
  });
});
