import { t } from '../../copy/ko';
import { deferred } from '../../test/deferred';
import { failWhile } from '../../test/displayAsserts';
import { loadFixture } from '../../test/fixtures';
import { aiGet, createAiHarness, finish, getFx, gets, settle, tick } from '../../test/aiReviewHarness';
import type { AiHarness } from '../../test/aiReviewHarness';
import { AI_POST_ID } from '../../test/aiReviewHarness';

const entryOf = (h: AiHarness) => h.store.entry(AI_POST_ID);
const respond = (fixture: string) => loadFixture(`${fixture}.json`).toResponse();

describe('AiReviewStore 코드리뷰 회귀', () => {
  it('리뷰5 창 종료(stalled) 뒤 재확인이 실패해도 폴링을 이어 가며 stalled는 풀린다', async () => {
    let failing = false;
    const h = createAiHarness();
    h.router.set(aiGet(), (_req, index) => (index === 0 ? respond(getFx('processing')) : failWhile(() => failing, getFx('500-server-error'), getFx('processing'))()));
    const w = h.watch();
    await finish(h, w.show());
    await tick(h, 300_000);
    expect(entryOf(h)).toMatchObject({ stalled: true, polling: false });
    failing = true;
    await finish(h, w.recheck());
    expect(entryOf(h)).toMatchObject({ status: 'PROCESSING', stalled: false, polling: true });
  });

  it('리뷰6 check-failed에서 다시 확인을 시작하면 먼저 checking이 되고 연타해도 GET은 한 번이다', async () => {
    const gate = deferred<void>();
    let failing = true;
    const h = createAiHarness();
    h.router.set(aiGet(), async () => {
      if (failing) return respond(getFx('500-server-error'));
      await gate.promise;
      return respond(getFx('none'));
    });
    const w = h.watch();
    await finish(h, w.show());
    expect(entryOf(h)).toMatchObject({ phase: 'check-failed' });
    failing = false;
    const before = gets(h);
    const all = Promise.all([w.recheck(), w.recheck(), w.recheck()]);
    await settle();
    expect(entryOf(h)).toMatchObject({ phase: 'checking' });
    gate.resolve();
    await finish(h, all);
    expect(gets(h) - before).toBe(1);
    expect(entryOf(h)).toMatchObject({ phase: 'ready', status: 'NONE' });
  });

  it('리뷰6 다시 확인이 또 실패하면 check-failed로 돌아온다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('500-server-error') } });
    const w = h.watch();
    await finish(h, w.show());
    await finish(h, w.recheck());
    expect(entryOf(h)).toMatchObject({ phase: 'check-failed' });
  });

  it('리뷰10 이미 보이는 손잡이의 두 번째 show는 진행 중인 GET이 반영될 때까지 이행되지 않는다', async () => {
    const gate = deferred<void>();
    const h = createAiHarness({ routes: { [aiGet()]: async () => (await gate.promise, respond(getFx('none'))) } });
    const w = h.watch();
    const first = w.show();
    let secondDone = false;
    void w.show().then(() => {
      secondDone = true;
    });
    await settle();
    expect(secondDone).toBe(false);
    gate.resolve();
    await finish(h, first);
    await settle();
    expect(secondDone).toBe(true);
    expect(gets(h)).toBe(1);
  });

  it('리뷰4 onReadError가 true면 첫 확인 실패 토스트를 생략하고 폴링 오류는 소비자 판단에 따라 창마다 1회 보인다', async () => {
    let failing = false;
    const h = createAiHarness();
    h.router.set(aiGet(), (_req, index) => (index === 0 ? respond(getFx('processing')) : failWhile(() => failing, getFx('500-server-error'), getFx('processing'))()));
    const w = h.watch({ onReadError: (_error, phase) => phase === 'check' });
    await finish(h, w.show());
    failing = true;
    await tick(h, 30_000);
    expect(h.toasts.messages).toEqual([t('ai.error.load')]); // 폴링 오류: 1회
    const quietFirst = createAiHarness({ routes: { [aiGet()]: getFx('500-server-error') } });
    await finish(quietFirst, quietFirst.watch({ onReadError: () => true }).show());
    expect(quietFirst.store.entry(AI_POST_ID)).toMatchObject({ phase: 'check-failed' });
    expect(quietFirst.toasts.messages).toEqual([]);
  });
});
