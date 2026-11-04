import { vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { t } from '../../copy/ko';
import { deferred } from '../../test/deferred';
import type { RecordedRequest } from '../../test/fakeFetch';
import { json } from '../../test/fixtureRouter';
import { loadFixture } from '../../test/fixtures';
import { PAST_POST_ID, aiGet, aiPost, getFx, postFx } from '../../test/aiReviewHarness';
import { MINE, OTHER, detailKey } from '../../test/postRoutes';
import { advance, openApp, toastText } from '../../test/postScreens';
import { screenViews } from '../../test/screenViews';
import type { PostSeed } from '../post/postModels';

vi.setConfig({ testTimeout: 15_000 }); // 구현 전에는 findBy가 5초 뒤 단언 오류로 끝나게 한다

const tid = (id: string) => screen.getByTestId(id);
const maybe = (id: string) => screen.queryByTestId(id);
const seedMine: PostSeed = {
  id: MINE,
  authorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  originalImageUrl: `https://cdn.example.test/posts/${MINE}/original.webp`,
  thumbnailImageUrl: `https://cdn.example.test/posts/${MINE}/thumbnail.webp`,
  title: '비 오는 날',
  likeCount: 10,
  isLiked: false,
  isMine: true,
};
const seedOther: PostSeed = { ...seedMine, id: OTHER, authorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', isMine: false };
const seedPast: PostSeed = { ...seedMine, id: PAST_POST_ID };

type Routes = NonNullable<Parameters<typeof openApp>[0]>['routes'];

/** 내 오늘 게시물 상세를 열고 상세 응답이 반영될 때까지 기다린다. */
async function openMine(routes: Routes = {}, state: Record<string, unknown> = {}) {
  const view = await openApp({ path: { pathname: `/feed/${MINE}`, state: { seed: seedMine, ...state } }, routes });
  await waitFor(() => expect(tid('feed.like-button')).toBeEnabled());
  return view;
}
async function openPast(routes: Routes = {}) {
  const view = await openApp({
    path: { pathname: `/feed/${PAST_POST_ID}`, state: { seed: seedPast } },
    routes: { [detailKey(PAST_POST_ID)]: 'feed/posts-detail__mine-past', [aiGet(PAST_POST_ID)]: getFx('failed-can-retry'), ...routes },
  });
  await waitFor(() => expect(tid('feed.like-button')).toBeEnabled());
  return view;
}
const aiRequests = (h: { ff: { calls: readonly RecordedRequest[] } }) => h.ff.calls.filter((c) => c.path.endsWith('/ai-review'));

describe('상세 AI 알약 (TC-AIR-012 ~ 017, 057)', () => {
  it.each([
    ['none', 'feed.ai-request-button', 'ai.pill.request'],
    ['processing', 'feed.ai-processing', 'ai.pill.processing'],
    ['completed', 'feed.ai-result-button', 'ai.pill.view'],
    ['failed-can-retry', 'feed.ai-retry-button', 'ai.pill.retry'],
    ['failed-cannot-retry', 'feed.ai-failed-button', 'ai.pill.failed'],
  ] as const)('TC-AIR-012 TC-AIR-013 TC-AIR-014 TC-AIR-015 TC-AIR-057 GET %s → %s 하나만 보이고 문구가 맞다', async (fixture, testId, copyKey) => {
    await openMine({ [aiGet()]: getFx(fixture) });
    expect(await screen.findByTestId(testId)).toHaveTextContent(t(copyKey));
    const all = ['feed.ai-request-button', 'feed.ai-checking', 'feed.ai-requesting', 'feed.ai-processing', 'feed.ai-result-button', 'feed.ai-retry-button', 'feed.ai-failed-button', 'feed.ai-recheck-button'];
    for (const other of all.filter((id) => id !== testId)) expect(maybe(other), other).not.toBeInTheDocument();
  });

  it('TC-AIR-013 분석중 알약은 비활성이다', async () => {
    await openMine({ [aiGet()]: getFx('processing') });
    expect(await screen.findByTestId('feed.ai-processing')).toBeDisabled();
  });

  it('TC-AIR-057 REQ-AIR-008 첫 GET을 기다리는 동안은 비활성 "AI 상태 확인중"이다', async () => {
    const gate = deferred<void>();
    await openMine({
      [aiGet()]: async () => {
        await gate.promise;
        return loadFixture(`${getFx('none')}.json`).toResponse();
      },
    });
    const checking = await screen.findByTestId('feed.ai-checking');
    expect(checking).toHaveTextContent(t('ai.pill.checking'));
    expect(checking).toBeDisabled();
    await act(async () => gate.resolve());
    await screen.findByTestId('feed.ai-request-button');
    expect(maybe('feed.ai-checking')).not.toBeInTheDocument();
  });

  it('TC-AIR-057 REQ-AIR-010 POST를 기다리는 동안은 비활성 "AI 요청중"이다', async () => {
    const gate = deferred<void>();
    await openMine({
      [aiPost()]: async () => {
        await gate.promise;
        return loadFixture(`${postFx('202-processing')}.json`).toResponse();
      },
    });
    fireEvent.click(await screen.findByTestId('feed.ai-request-button'));
    fireEvent.click(await screen.findByTestId('ai-start-sheet.start-button'));
    const requesting = await screen.findByTestId('feed.ai-requesting');
    expect(requesting).toHaveTextContent(t('ai.pill.requesting'));
    expect(requesting).toBeDisabled();
    await act(async () => gate.resolve());
    await screen.findByTestId('feed.ai-processing');
  });

  it('TC-AIR-017 REQ-AIR-001 남의 게시물 상세에는 AI 알약도 ai-review 요청도 없다', async () => {
    const { h } = await openApp({ path: { pathname: `/feed/${OTHER}`, state: { seed: seedOther } } });
    await waitFor(() => expect(tid('feed.like-button')).toBeEnabled());
    await advance(h, 5_000);
    expect(document.querySelector('[data-testid^="feed.ai-"]')).toBeNull();
    expect(aiRequests(h)).toHaveLength(0);
  });

  it('TC-AIR-017 REQ-AIR-005 서버가 404를 주면 알약이 없고 메시지도 없다', async () => {
    const { h } = await openMine({ [aiGet()]: getFx('404-not-found') });
    await advance(h, 1_000);
    expect(document.querySelector('[data-testid^="feed.ai-"]')).toBeNull();
    expect(toastText()).toBeNull();
  });

  it('TC-AIR-016 지난 주제의 내 게시물: 실패는 재요청 없이 실패 알약이고 누르면 "오늘 올린 사진만" 안내 실패 시트다', async () => {
    await openPast();
    fireEvent.click(await screen.findByTestId('feed.ai-failed-button'));
    expect(maybe('feed.ai-retry-button')).not.toBeInTheDocument();
    expect(await screen.findByTestId('ai-failed-sheet.message')).toHaveTextContent(t('ai.failed.past'));
    expect(maybe('ai-failed-sheet.retry-button')).not.toBeInTheDocument();
  });

  it('TC-AIR-016 REQ-AIR-004 지난 주제의 NONE이면 알약을 숨기고, 완료 결과는 보여 준다', async () => {
    const none = await openPast({ [aiGet(PAST_POST_ID)]: getFx('none') });
    await advance(none.h, 500);
    expect(document.querySelector('[data-testid^="feed.ai-"]')).toBeNull();
  });

  it('TC-AIR-016 지난 주제의 완료 결과는 알약 "AI 피드백 보기"로 연다', async () => {
    await openPast({ [aiGet(PAST_POST_ID)]: getFx('completed') });
    expect(await screen.findByTestId('feed.ai-result-button')).toHaveTextContent(t('ai.pill.view'));
  });

  it('TC-AIR-040 REQ-AIR-016 첫 GET이 실패하면 "AI 상태 다시 확인" 알약이고 누르면 다시 조회해 복구한다', async () => {
    const { fixtures, h } = await openMine({ [aiGet()]: getFx('500-server-error') });
    await advance(h, 2_000); // GET 재시도 백오프는 가상 시간이다
    const recheck = await screen.findByTestId('feed.ai-recheck-button');
    expect(recheck).toHaveTextContent(t('ai.pill.recheck'));
    await waitFor(() => expect(toastText()).toBe(t('ai.error.load')));
    fixtures.set(aiGet(), getFx('none'));
    fireEvent.click(recheck);
    await screen.findByTestId('feed.ai-request-button');
    expect(maybe('feed.ai-recheck-button')).not.toBeInTheDocument();
  });

  it('TC-AIR-011 상세에 들어오면 GET만 보내고 POST는 보내지 않는다. 화면 이름은 feed 하나뿐이다(시트·알약은 screen_view가 아니다)', async () => {
    const { h } = await openMine();
    await screen.findByTestId('feed.ai-request-button');
    fireEvent.click(tid('feed.ai-request-button'));
    await screen.findByTestId('ai-start-sheet.root');
    expect(aiRequests(h).map((c) => c.method)).toEqual(['GET']);
    expect(screenViews(h.tracker)).toEqual(['feed']);
  });
});

describe('시작·재요청 시트 (TC-AIR-020, 021, 023, 054)', () => {
  it('TC-AIR-020 시작 시트: 제목, 안내 세 줄, "분석 시작하기"가 보이고 닫으면 POST가 없다', async () => {
    const { fixtures } = await openMine();
    fireEvent.click(await screen.findByTestId('feed.ai-request-button'));
    const sheet = await screen.findByTestId('ai-start-sheet.root');
    expect(sheet).toHaveAccessibleName(t('ai.start.title'));
    const description = within(sheet).getByTestId('ai-start-sheet.description');
    for (const key of ['ai.start.line1', 'ai.start.line2', 'ai.start.line3'] as const) expect(description).toHaveTextContent(t(key));
    expect(within(sheet).getByTestId('ai-start-sheet.start-button')).toHaveTextContent(t('ai.start.confirm'));
    fireEvent.click(within(sheet).getByTestId('ai-start-sheet.close-button'));
    await waitFor(() => expect(maybe('ai-start-sheet.root')).not.toBeInTheDocument());
    expect(fixtures.calls(aiPost())).toHaveLength(0);
  });

  it('TC-AIR-021 REQ-AIR-018 시작 시트에는 추가 동의·개인정보 체크 UI가 없다', async () => {
    await openMine();
    fireEvent.click(await screen.findByTestId('feed.ai-request-button'));
    const sheet = await screen.findByTestId('ai-start-sheet.root');
    expect(within(sheet).queryAllByRole('checkbox')).toHaveLength(0);
    expect(within(sheet).queryAllByRole('radio')).toHaveLength(0);
    expect(within(sheet).queryAllByRole('switch')).toHaveLength(0);
  });

  it('TC-AIR-020 TC-AIR-023 확정하면 POST를 1회 보내고 시트가 닫히며 분석중이 된다. 시트 안 연타도 1건이다', async () => {
    const { fixtures } = await openMine({ [aiPost()]: postFx('202-processing') });
    fireEvent.click(await screen.findByTestId('feed.ai-request-button'));
    const start = await screen.findByTestId('ai-start-sheet.start-button');
    fireEvent.click(start);
    fireEvent.click(start);
    fireEvent.click(start);
    await screen.findByTestId('feed.ai-processing');
    expect(maybe('ai-start-sheet.root')).not.toBeInTheDocument();
    expect(fixtures.calls(aiPost())).toHaveLength(1);
    expect(fixtures.calls(aiPost())[0]!.body).toBeNull();
  });

  it('TC-AIR-020 FAILED + 재요청 가능이면 재요청 시트(제목이 다르다)를 거쳐 POST 한다', async () => {
    const { fixtures } = await openMine({ [aiGet()]: getFx('failed-can-retry'), [aiPost()]: postFx('202-processing') });
    fireEvent.click(await screen.findByTestId('feed.ai-retry-button'));
    expect(await screen.findByTestId('ai-start-sheet.root')).toHaveAccessibleName(t('ai.start.title-retry'));
    expect(fixtures.calls(aiPost())).toHaveLength(0);
    fireEvent.click(tid('ai-start-sheet.start-button'));
    await screen.findByTestId('feed.ai-processing');
    expect(fixtures.calls(aiPost())).toHaveLength(1);
  });

  it('웹 모달: 열리면 포커스가 시트 안으로 가고 배경은 inert이며 Esc로 닫고 포커스가 알약으로 돌아온다', async () => {
    await openMine();
    const trigger = await screen.findByTestId('feed.ai-request-button');
    trigger.focus();
    fireEvent.click(trigger);
    const sheet = await screen.findByTestId('ai-start-sheet.root');
    expect(sheet).toHaveAttribute('role', 'dialog');
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(sheet.contains(document.activeElement)).toBe(true);
    expect(tid('feed.back-button').closest('[inert]')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(maybe('ai-start-sheet.root')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(tid('feed.ai-request-button'));
    expect(tid('feed.back-button').closest('[inert]')).toBeNull();
  });

  it('TC-AIR-026 POST 400이면 서버 message 토스트를 2.5초 안에 보이고 알약은 그대로 요청 가능이다', async () => {
    await openMine({ [aiPost()]: postFx('400-limit-reached') });
    fireEvent.click(await screen.findByTestId('feed.ai-request-button'));
    fireEvent.click(await screen.findByTestId('ai-start-sheet.start-button'));
    await waitFor(() => expect(toastText()).toBe('더 이상 AI 리뷰를 다시 요청할 수 없습니다.'));
    expect(tid('feed.ai-request-button')).toBeEnabled();
  });

  it('TC-AIR-027 D-08 POST 403이면 정지 안내 토스트가 뜬다', async () => {
    await openMine({ [aiPost()]: postFx('403-banned') });
    fireEvent.click(await screen.findByTestId('feed.ai-request-button'));
    fireEvent.click(await screen.findByTestId('ai-start-sheet.start-button'));
    await waitFor(() => expect(toastText()).toBe(t('ai.error.banned')));
  });

  it('TC-AIR-028 POST 404이면 알약이 사라지고 안내 토스트가 뜬다', async () => {
    await openMine({ [aiPost()]: postFx('404-not-found') });
    fireEvent.click(await screen.findByTestId('feed.ai-request-button'));
    fireEvent.click(await screen.findByTestId('ai-start-sheet.start-button'));
    await waitFor(() => expect(toastText()).toBe(t('ai.error.not-found')));
    expect(maybe('feed.ai-request-button')).not.toBeInTheDocument();
  });

  it('TC-AIR-030 POST 연결 실패면 네트워크 토스트이고 POST는 다시 보내지 않는다', async () => {
    const { fixtures, h } = await openMine({
      [aiPost()]: () => {
        throw new TypeError('Failed to fetch');
      },
    });
    fireEvent.click(await screen.findByTestId('feed.ai-request-button'));
    fireEvent.click(await screen.findByTestId('ai-start-sheet.start-button'));
    await waitFor(() => expect(toastText()).toBe(t('ai.error.network')));
    await advance(h, 10_000);
    expect(fixtures.calls(aiPost())).toHaveLength(1);
  });

  it('TC-AIR-045 KST 자정이 지나면 요청 알약이 사라지고 열려 있던 시트에서 확정해도 POST를 보내지 않는다', async () => {
    const { fixtures, h } = await openMine();
    fireEvent.click(await screen.findByTestId('feed.ai-request-button'));
    await screen.findByTestId('ai-start-sheet.start-button');
    await advance(h, 12 * 3600 * 1000 - 1); // 하네스 시계는 KST 12:00이다: 23:59:59.999
    expect(maybe('ai-start-sheet.start-button')).toBeInTheDocument();
    await advance(h, 1); // 자정
    await waitFor(() => expect(maybe('feed.ai-request-button')).not.toBeInTheDocument());
    const start = maybe('ai-start-sheet.start-button');
    if (start) fireEvent.click(start);
    await advance(h, 500);
    expect(fixtures.calls(aiPost())).toHaveLength(0);
  });
});

describe('폴링 안내와 가시성 (TC-AIR-035, 037, 042)', () => {
  it('TC-AIR-035 TC-AIR-037 REQ-AIR-027 300초가 지나면 분석중 알약은 그대로 두고 안내 문구와 "다시 확인" 버튼이 보인다. 누르면 GET 뒤 안내가 사라진다', async () => {
    const { h, fixtures } = await openMine({ [aiGet()]: getFx('processing') });
    await screen.findByTestId('feed.ai-processing');
    expect(maybe('feed.ai-message')).not.toBeInTheDocument();
    await advance(h, 299_999);
    expect(maybe('feed.ai-message')).not.toBeInTheDocument();
    await advance(h, 1);
    expect(await screen.findByTestId('feed.ai-message')).toHaveTextContent(t('ai.poll.timeout'));
    expect(tid('feed.ai-processing')).toHaveTextContent(t('ai.pill.processing'));
    expect(fixtures.calls(aiPost())).toHaveLength(0);
    fireEvent.click(tid('feed.ai-recheck-button'));
    await waitFor(() => expect(maybe('feed.ai-message')).not.toBeInTheDocument());
    expect(tid('feed.ai-processing')).toBeInTheDocument();
  });

  it('TC-AIR-038 폴링 중 완료되면 알약이 "AI 피드백 보기"로 바뀐다(시트는 자동으로 열리지 않는다)', async () => {
    const { h } = await openMine({ [aiGet()]: [getFx('processing'), getFx('completed')] });
    await screen.findByTestId('feed.ai-processing');
    await advance(h, 3_000);
    expect(await screen.findByTestId('feed.ai-result-button')).toBeInTheDocument();
    expect(maybe('ai-result-sheet.root')).not.toBeInTheDocument();
  });

  it('TC-AIR-042 문서가 숨겨지면 폴링을 멈추고 다시 보이면 GET부터 시작한다', async () => {
    const state = vi.spyOn(document, 'visibilityState', 'get');
    try {
      state.mockReturnValue('visible');
      const { h, fixtures } = await openMine({ [aiGet()]: getFx('processing') });
      await screen.findByTestId('feed.ai-processing');
      state.mockReturnValue('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await advance(h, 0);
      const before = fixtures.calls(aiGet()).length;
      await advance(h, 30_000);
      expect(fixtures.calls(aiGet()).length).toBe(before);
      state.mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await waitFor(() => expect(fixtures.calls(aiGet()).length).toBeGreaterThan(before));
    } finally {
      state.mockRestore();
    }
  });
});

describe('결과 시트 (TC-AIR-010, 049 ~ 052, 054)', () => {
  const openResult = async (fixture = 'completed') => {
    const view = await openMine({ [aiGet()]: getFx(fixture) });
    fireEvent.click(await screen.findByTestId('feed.ai-result-button'));
    await screen.findByTestId('ai-result-sheet.root');
    return view;
  };

  it('TC-AIR-049 요약(굵은 제목)·점수(7.5)·criteria·"좋았던 점"·"아쉬운 점"·"다음엔 이렇게"가 이 순서로 보인다', async () => {
    await openResult();
    const sheet = tid('ai-result-sheet.root');
    expect(sheet).toHaveAttribute('role', 'dialog');
    expect(tid('ai-result-sheet.feedback-summary')).toHaveTextContent('빛을 따라 시선이 흐르는 안정적인 구도');
    expect(tid('ai-result-sheet.overall-score')).toHaveTextContent('7.5');
    expect(tid('ai-result-sheet.criteria-item-COMPOSITION')).toHaveTextContent('구도');
    expect(tid('ai-result-sheet.criteria-item-COMPOSITION')).toHaveTextContent('7.5');
    expect(tid('ai-result-sheet.feedback-strength')).toHaveTextContent(t('ai.result.strength'));
    expect(tid('ai-result-sheet.feedback-strength')).toHaveTextContent('빛이 들어오는 방향을 따라 시선이 자연스럽게 이어집니다.');
    expect(tid('ai-result-sheet.feedback-weakness')).toHaveTextContent(t('ai.result.weakness'));
    expect(tid('ai-result-sheet.feedback-weakness')).toHaveTextContent('수평선이 살짝 기울어 안정감이 조금 떨어집니다.');
    expect(tid('ai-result-sheet.feedback-suggestion')).toHaveTextContent(t('ai.result.suggestion'));
    expect(tid('ai-result-sheet.feedback-suggestion')).toHaveTextContent('카메라를 낮추고 수평선을 맞춰 한 번 더 찍어 보세요.');
    const order = ['feedback-summary', 'overall-score', 'criteria-item-COMPOSITION', 'feedback-strength', 'feedback-weakness', 'feedback-suggestion'].map((id) => tid(`ai-result-sheet.${id}`));
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `${i}번째`).toBeTruthy();
    }
  });

  it.each([
    ['completed-score-10', '10.0'],
    ['completed-score-0', '0.0'],
  ])('TC-AIR-049 점수는 소수 첫째 자리로 표시한다(%s → %s)', async (fixture, text) => {
    await openResult(fixture);
    expect(tid('ai-result-sheet.overall-score')).toHaveTextContent(text);
  });

  it('TC-AIR-050 REQ-AIR-040 종합 점수의 접근성 이름은 "전체 점수 10점 만점에 7.5점"이다', async () => {
    await openResult();
    expect(tid('ai-result-sheet.overall-score')).toHaveAccessibleName(t('ai.result.score-a11y', { X: '7.5' }));
  });

  it('TC-AIR-051 distinctivePerspective=true면 배지가 있고 false면 없다', async () => {
    await openResult();
    expect(tid('ai-result-sheet.distinctive-badge')).toHaveTextContent(t('ai.result.perspective-badge'));
  });

  it('TC-AIR-051 distinctivePerspective=false면 배지가 없다', async () => {
    await openResult('completed-not-distinct');
    expect(maybe('ai-result-sheet.distinctive-badge')).not.toBeInTheDocument();
  });

  it('TC-AIR-010 criteria 3개와 상한 길이 문구를 목록으로 모두 보인다', async () => {
    await openResult('completed-long-text');
    for (const key of ['COMPOSITION', 'LIGHT', 'SUBJECT']) expect(tid(`ai-result-sheet.criteria-item-${key}`)).toBeInTheDocument();
    const body = loadFixture(`${getFx('completed-long-text')}.json`).json as { result: { feedback: { summary: string; strength: string } } };
    expect(tid('ai-result-sheet.feedback-summary')).toHaveTextContent(body.result.feedback.summary);
    expect(tid('ai-result-sheet.feedback-strength')).toHaveTextContent(body.result.feedback.strength);
  });

  it('TC-AIR-010 REQ-AIR-039 criteria가 0개여도 깨지지 않는다', async () => {
    await openMine({
      [aiGet()]: () => {
        const body = structuredClone(loadFixture(`${getFx('completed')}.json`).json) as { result: { criteria: unknown[] } };
        body.result.criteria = [];
        return json(200, body);
      },
    });
    fireEvent.click(await screen.findByTestId('feed.ai-result-button'));
    await screen.findByTestId('ai-result-sheet.root');
    expect(document.querySelector('[data-testid^="ai-result-sheet.criteria-item-"]')).toBeNull();
    expect(tid('ai-result-sheet.overall-score')).toHaveTextContent('7.5');
  });

  it('TC-AIR-052 REQ-AIR-041 기준 안내 버튼은 "찰칵AI는 어떤 기준으로 점수를 내나요?" 다이얼로그를 열고 닫으면 결과 시트는 남는다', async () => {
    await openResult();
    fireEvent.click(tid('ai-result-sheet.criteria-info-button'));
    const dialog = await screen.findByTestId('ai-result-sheet.criteria-dialog');
    expect(dialog).toHaveAccessibleName(t('ai.result.criteria-dialog-title'));
    fireEvent.click(tid('ai-result-sheet.criteria-close-button'));
    await waitFor(() => expect(maybe('ai-result-sheet.criteria-dialog')).not.toBeInTheDocument());
    expect(tid('ai-result-sheet.root')).toBeInTheDocument();
  });

  it('결과 시트를 닫으면 알약으로 돌아오고 Esc로도 닫힌다. POST는 없다', async () => {
    const { fixtures } = await openResult();
    fireEvent.click(tid('ai-result-sheet.close-button'));
    await waitFor(() => expect(maybe('ai-result-sheet.root')).not.toBeInTheDocument());
    fireEvent.click(tid('feed.ai-result-button'));
    await screen.findByTestId('ai-result-sheet.root');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(maybe('ai-result-sheet.root')).not.toBeInTheDocument());
    expect(fixtures.calls(aiPost())).toHaveLength(0);
  });
});

describe('실패 시트 (TC-AIR-015, 053)', () => {
  it('TC-AIR-053 REQ-AIR-015 재요청 불가: 제목, "더 이상 요청할 수 없어요" 문구, "확인"만 있고 확인하면 닫힌다', async () => {
    await openMine({ [aiGet()]: getFx('failed-cannot-retry') });
    fireEvent.click(await screen.findByTestId('feed.ai-failed-button'));
    const sheet = await screen.findByTestId('ai-failed-sheet.root');
    expect(sheet).toHaveAccessibleName(t('ai.failed.title'));
    expect(tid('ai-failed-sheet.message')).toHaveTextContent(t('ai.failed.no-more'));
    expect(tid('ai-failed-sheet.confirm-button')).toHaveTextContent(t('ai.failed.confirm'));
    expect(maybe('ai-failed-sheet.retry-button')).not.toBeInTheDocument();
    fireEvent.click(tid('ai-failed-sheet.confirm-button'));
    await waitFor(() => expect(maybe('ai-failed-sheet.root')).not.toBeInTheDocument());
  });
});

describe('홈 "자세히 보기" 진입 (REQ-AIR-047, openAiReview)', () => {
  it('REQ-AIR-046 REQ-AIR-047 (웹은 홈 이동만) COMPLETED면 GET 뒤 결과 시트가 자동으로 열리고, 닫으면 다시 열리지 않는다', async () => {
    await openMine({ [aiGet()]: getFx('completed') }, { openAiReview: true });
    expect(await screen.findByTestId('ai-result-sheet.root')).toBeInTheDocument();
    fireEvent.click(tid('ai-result-sheet.close-button'));
    await waitFor(() => expect(maybe('ai-result-sheet.root')).not.toBeInTheDocument());
    expect(tid('feed.ai-result-button')).toBeInTheDocument();
  });

  it('FAILED면 실패 시트가 자동으로 열린다', async () => {
    await openMine({ [aiGet()]: getFx('failed-cannot-retry') }, { openAiReview: true });
    expect(await screen.findByTestId('ai-failed-sheet.root')).toBeInTheDocument();
  });

  it.each(['none', 'processing'])('GET이 %s이면 시트는 열리지 않는다', async (fixture) => {
    const { h } = await openMine({ [aiGet()]: getFx(fixture) }, { openAiReview: true });
    await advance(h, 500);
    expect(maybe('ai-result-sheet.root')).not.toBeInTheDocument();
    expect(maybe('ai-failed-sheet.root')).not.toBeInTheDocument();
    expect(maybe('ai-start-sheet.root')).not.toBeInTheDocument();
  });
});

describe('용어 통일 (TC-AIR-054)', () => {
  it('TC-AIR-054 알약·시트 어디에도 "AI 리뷰"가 보이지 않는다(서버 message 제외)', async () => {
    await openMine({ [aiGet()]: getFx('completed') });
    fireEvent.click(await screen.findByTestId('feed.ai-result-button'));
    await screen.findByTestId('ai-result-sheet.root');
    expect(document.body.textContent).not.toContain('AI 리뷰');
    fireEvent.click(tid('ai-result-sheet.close-button'));
    await waitFor(() => expect(maybe('ai-result-sheet.root')).not.toBeInTheDocument());
  });

  it('TC-AIR-054 시작 시트에도 "AI 리뷰"가 없다', async () => {
    await openMine();
    fireEvent.click(await screen.findByTestId('feed.ai-request-button'));
    await screen.findByTestId('ai-start-sheet.root');
    expect(document.body.textContent).not.toContain('AI 리뷰');
  });
});
