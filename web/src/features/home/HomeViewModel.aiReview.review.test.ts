import { t } from '../../copy/ko';
import { loadFixture } from '../../test/fixtures';
import { MY_POST_ID, createHomeHarness, finish } from '../../test/homeHarness';

const AI_GET = `GET /posts/${MY_POST_ID}/ai-review`;
const AI_POST = `POST /posts/${MY_POST_ID}/ai-review`;
const posts = (h: ReturnType<typeof createHomeHarness>) => h.router.calls(AI_POST).length;

describe('HomeViewModel AI 카드 코드리뷰 회귀', () => {
  it('리뷰3 REQ-AIR-019 NONE 카드의 요청 버튼은 시작 시트를 열고 "분석 시작하기"를 눌러야 POST 한다. 닫으면 POST가 없다', async () => {
    const h = createHomeHarness();
    h.router.set(AI_POST, 'ai-review/ai-review-post__202-processing');
    await finish(h, h.viewModel.onShown());
    await finish(h, h.viewModel.onAiRequestPress());
    expect(h.viewModel.state.aiStartSheet).toBe(true);
    expect(posts(h)).toBe(0);
    h.viewModel.closeAiStartSheet();
    await finish(h, h.viewModel.confirmAiStart());
    expect(posts(h)).toBe(0);
    await finish(h, h.viewModel.onAiRequestPress());
    await finish(h, h.viewModel.confirmAiStart());
    expect(h.viewModel.state.aiStartSheet).toBe(false);
    expect(posts(h)).toBe(1);
    expect(h.viewModel.state.ai).toMatchObject({ status: 'PROCESSING' });
  });

  it('리뷰2 REQ-AIR-003 시트를 연 채 자정이 지나 확정하면 POST를 보내지 않는다', async () => {
    const h = createHomeHarness();
    h.router.set(AI_POST, 'ai-review/ai-review-post__202-processing');
    await finish(h, h.viewModel.onShown());
    await finish(h, h.viewModel.onAiRequestPress());
    h.clock.setWallClock(h.clock.nowMs() + 13 * 3600 * 1000); // 기기 시각만 자정 뒤로(타이머는 아직 안 돌았다)
    await finish(h, h.viewModel.confirmAiStart());
    expect(posts(h)).toBe(0);
  });

  it('리뷰2 REQ-AIR-003 홈이 보이는 채 자정을 넘기면 어제 사진의 AI 카드를 내린다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.ai).toMatchObject({ kind: 'ready' });
    await h.clock.advance(12 * 3600 * 1000 + 1_000); // 하네스 시계는 KST 12:00
    expect(h.viewModel.state.ai).toEqual({ kind: 'hidden' });
    expect(h.viewModel.state.aiStartSheet).toBe(false);
  });

  it('리뷰4 REQ-AIR-029 홈 폴링 오류도 창마다 토스트 1회다(첫 확인 실패만 조용하다)', async () => {
    const h = createHomeHarness();
    let calls = 0;
    h.router.set(AI_GET, () => {
      calls += 1;
      return calls === 1 ? loadFixture('ai-review/ai-review-get__processing.json').toResponse() : loadFixture('ai-review/ai-review-get__500-server-error.json').toResponse();
    });
    await finish(h, h.viewModel.onShown());
    await h.clock.advance(30_000);
    expect(h.toasts.messages).toEqual([t('ai.error.load')]);
  });
});
