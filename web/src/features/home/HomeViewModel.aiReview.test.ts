import { t } from '../../copy/ko';
import { MY_POST_ID, createHomeHarness, finish, settle } from '../../test/homeHarness';
import type { HomeHarness } from '../../test/homeHarness';

const AI_GET = `GET /posts/${MY_POST_ID}/ai-review`;
const AI_POST = `POST /posts/${MY_POST_ID}/ai-review`;
const aiGets = (h: HomeHarness) => h.router.calls(AI_GET).length;

/**
 * W8: 홈 카드가 AiReviewStore를 쓴다. 기존 HomeViewModel.review/hero 테스트의 의도(상태 표시·요청 1회·403 차단·늦은 GET 무시·계정 전환)는 그대로이고,
 * 여기서는 저장소로 옮기며 새로 생기는 약속(공유 상태, 3초 폴링, 복귀 규칙, 창 종료)만 검증한다.
 */
describe('HomeViewModel AI 카드 + AiReviewStore (REQ-AIR-050 ~ 053)', () => {
  it('REQ-AIR-050 카드 상태는 저장소 entry와 같다: 홈이 보이면 저장소에 게시물 상태가 생긴다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    expect(h.aiReviews.entry(MY_POST_ID)).toMatchObject({ phase: 'ready', status: 'NONE' });
    expect(h.viewModel.state.ai).toMatchObject({ kind: 'ready', postId: MY_POST_ID, status: 'NONE', requesting: false });
  });

  it('REQ-AIR-050 상세 쪽 손잡이가 보낸 요청 결과를 홈 카드가 곧바로 본다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    h.router.set(AI_POST, 'ai-review/ai-review-post__202-processing');
    const feed = h.aiReviews.watch(MY_POST_ID, { refreshCompleted: true });
    await finish(h, feed.show());
    await finish(h, feed.request());
    await settle();
    expect(h.viewModel.state.ai).toMatchObject({ status: 'PROCESSING', requesting: false });
  });

  it('REQ-AIR-050 홈 카드의 요청을 상세 쪽 손잡이가 같은 entry로 본다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    h.router.set(AI_POST, 'ai-review/ai-review-post__202-processing');
    await finish(h, h.viewModel.onAiRequestPress());
    expect(h.aiReviews.entry(MY_POST_ID)).toMatchObject({ status: 'PROCESSING', polling: true });
  });

  it('TC-AIR-034 TC-AIR-013 홈도 3초 간격으로 폴링한다(5초가 아님): PROCESSING → 3초에 GET, COMPLETED를 받으면 카드가 완료로 바뀐다', async () => {
    const h = createHomeHarness();
    h.router.set(AI_GET, ['ai-review/ai-review-get__processing', 'ai-review/ai-review-get__processing', 'ai-review/ai-review-get__completed']);
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.ai).toMatchObject({ status: 'PROCESSING' });
    const base = aiGets(h);
    await h.clock.advance(2_999);
    expect(aiGets(h)).toBe(base);
    await h.clock.advance(1);
    expect(aiGets(h)).toBe(base + 1);
    await h.clock.advance(3_000);
    expect(h.viewModel.state.ai).toMatchObject({ status: 'COMPLETED' });
    await h.clock.advance(30_000);
    expect(aiGets(h)).toBe(base + 2);
  });

  it('TC-AIR-018 홈이 가려졌다 돌아오면 완료 결과는 다시 조회하지 않고 유지한다', async () => {
    const h = createHomeHarness();
    h.router.set(AI_GET, 'ai-review/ai-review-get__completed');
    await finish(h, h.viewModel.onShown());
    h.viewModel.onHidden();
    await finish(h, h.viewModel.onShown());
    expect(aiGets(h)).toBe(1);
    expect(h.viewModel.state.ai).toMatchObject({ status: 'COMPLETED' });
  });

  it('TC-AIR-018 TC-AIR-042 처리 중이었다면 이탈 중에는 폴링하지 않고 복귀하면 상태를 표시한 채 GET부터 다시 시작한다', async () => {
    const h = createHomeHarness();
    h.router.set(AI_GET, 'ai-review/ai-review-get__processing');
    await finish(h, h.viewModel.onShown());
    h.viewModel.onHidden();
    const hiddenAt = aiGets(h);
    await h.clock.advance(30_000);
    expect(aiGets(h)).toBe(hiddenAt);
    expect(h.viewModel.state.ai).toMatchObject({ status: 'PROCESSING' });
    await finish(h, h.viewModel.onShown());
    expect(aiGets(h)).toBe(hiddenAt + 1);
  });

  it('REQ-AIR-036 홈 카드의 실패 재요청은 시트 없이 바로 POST 하고 진행 중이 된다', async () => {
    const h = createHomeHarness();
    h.router.set(AI_GET, 'ai-review/ai-review-get__failed-can-retry');
    h.router.set(AI_POST, 'ai-review/ai-review-post__202-processing');
    await finish(h, h.viewModel.onShown());
    await finish(h, h.viewModel.onAiRequestPress());
    expect(h.router.calls(AI_POST)).toHaveLength(1);
    expect(h.viewModel.state.ai).toMatchObject({ status: 'PROCESSING' });
  });

  it('REQ-AIR-053 TC-AIR-026 홈 카드의 POST 400은 상세와 같이 서버 message를 토스트로 보이고 카드 상태를 유지한다', async () => {
    const h = createHomeHarness();
    h.router.set(AI_POST, 'ai-review/ai-review-post__400-limit-reached');
    await finish(h, h.viewModel.onShown());
    await finish(h, h.viewModel.onAiRequestPress());
    expect(h.toasts.messages).toEqual(['더 이상 AI 리뷰를 다시 요청할 수 없습니다.']);
    expect(h.viewModel.state.ai).toMatchObject({ status: 'NONE', requesting: false });
  });

  it('REQ-AIR-053 TC-AIR-030 홈 카드의 POST 연결 실패는 네트워크 토스트 뒤 GET으로 동기화하고 POST는 다시 보내지 않는다', async () => {
    const h = createHomeHarness();
    h.router.set(AI_POST, () => {
      throw new TypeError('Failed to fetch');
    });
    await finish(h, h.viewModel.onShown());
    await finish(h, h.viewModel.onAiRequestPress());
    expect(h.toasts.messages).toEqual([t('ai.error.network')]);
    expect(aiGets(h)).toBe(2);
    await h.clock.advance(10_000);
    expect(h.router.calls(AI_POST)).toHaveLength(1);
  });

  it('TC-AIR-035 홈에서도 300초 창이 끝나면 GET을 멈추고 카드는 진행중을 유지하며 POST는 보내지 않는다', async () => {
    const h = createHomeHarness();
    h.router.set(AI_GET, 'ai-review/ai-review-get__processing');
    await finish(h, h.viewModel.onShown());
    await h.clock.advance(300_000);
    expect(h.viewModel.state.ai).toMatchObject({ status: 'PROCESSING', stalled: true });
    const stopped = aiGets(h);
    await h.clock.advance(60_000);
    expect(aiGets(h)).toBe(stopped);
    expect(h.router.calls(AI_POST)).toHaveLength(0);
  });

  it('TC-AIR-044 홈 카드의 게시물이 바뀌면(삭제 후 새 사진) 이전 게시물의 완료 결과가 카드에 남지 않는다', async () => {
    const h = createHomeHarness();
    h.router.set(AI_GET, 'ai-review/ai-review-get__completed');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.ai).toMatchObject({ status: 'COMPLETED' });
    h.changes.publish({ type: 'removed', postId: MY_POST_ID });
    expect(h.viewModel.state.ai).toEqual({ kind: 'hidden' });
  });
});
