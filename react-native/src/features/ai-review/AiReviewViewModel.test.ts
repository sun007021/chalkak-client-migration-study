import { unauthorized } from '../../core/http/__testing__/createNetHarness';
import { d } from '../../core/time/__testing__/helpers';
import type { KstDate } from '../../core/time/KstDate';
import { t } from '../../shared/copy';
import {
  COMPLETED,
  FAILED_RETRY,
  GET_AI,
  NONE,
  POST_202,
  POST_AI,
  POST_ID,
  PROCESSING,
  createAiReviewHarness,
  fx,
  gate,
  type AiReviewHarnessOptions,
} from './__testing__/createAiReviewHarness';
import { AiReviewViewModel } from './AiReviewViewModel';

const SEC = 1000;
const TODAY = d('2026-10-27');
const PAST = d('2026-10-26');
const CANNOT_RETRY = fx('ai-review-get__failed-cannot-retry');

type VmOptions = AiReviewHarnessOptions & {
  topicDate?: KstDate | null;
  isMine?: boolean;
  surface?: 'feed' | 'home';
  entry?: 'normal' | 'push';
};

async function setup(options: VmOptions = {}) {
  const h = await createAiReviewHarness(options);
  const viewModel = new AiReviewViewModel({
    target: {
      postId: POST_ID,
      topicDate: options.topicDate === undefined ? TODAY : options.topicDate,
      isMine: options.isMine ?? true,
    },
    mode: options.mode ?? 'member',
    surface: options.surface ?? 'feed',
    entry: options.entry ?? 'normal',
    clock: h.clock,
    poller: h.poller,
    visibility: h.visibility,
  });
  const shown = async () => {
    await viewModel.onShown();
    await h.pollSleeper.settle();
  };
  return { ...h, viewModel, shown, state: () => viewModel.getSnapshot() };
}

/** 상태 객체 안의 모든 문자열. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('AiReviewViewModel 진입 조건 (REQ-AIR-001, 002, 007)', () => {
  it('TC-AIR-017 남의 게시물이면 알약이 없고 GET도 0건이다', async () => {
    const h = await setup({ isMine: false });
    await h.shown();
    expect(h.state().pill).toBeNull();
    expect(h.timesOf(GET_AI)).toHaveLength(0);
    expect(h.timesOf(POST_AI)).toHaveLength(0);
  });

  it('TC-AIR-017 게스트면 알약도 API 호출도 없다', async () => {
    const h = await setup({ mode: 'guest' });
    await h.shown();
    expect(h.state().pill).toBeNull();
    expect(h.transport.requests).toHaveLength(0);
  });

  it('TC-AIR-011 내 게시물 진입은 GET만 호출하고 자동으로 POST하지 않는다', async () => {
    const h = await setup();
    await h.shown();
    expect(h.timesOf(GET_AI)).toHaveLength(1);
    expect(h.timesOf(POST_AI)).toHaveLength(0);
  });

  it('TC-AIR-017 GET 404면 알약을 숨기고 메시지 없이 폴링을 멈춘다', async () => {
    const h = await setup({ routes: { [GET_AI]: fx('ai-review-get__404-not-found') } });
    await h.shown();
    expect(h.state().pill).toBeNull();
    expect(h.toast.messages).toEqual([]);
    await h.pollSleeper.advance(60 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(1);
  });
});

describe('AiReviewViewModel 알약 상태 (REQ-AIR-008~017)', () => {
  it('REQ-AIR-008 첫 GET을 기다리는 동안 비활성 "AI 상태 확인중"이다', async () => {
    const slow = gate(NONE);
    const h = await setup({ routes: { [GET_AI]: slow.route } });
    void h.viewModel.onShown();
    await h.pollSleeper.settle();
    expect(h.state().pill).toEqual({
      kind: 'checking',
      label: t('ai.pill.checking'),
      enabled: false,
    });
    slow.release();
    await h.pollSleeper.settle();
    expect(h.state().pill?.kind).toBe('request');
  });

  it('TC-AIR-012 NONE은 "AI 피드백 받기"이고 폴링하지 않는다', async () => {
    const h = await setup({ routes: { [GET_AI]: NONE } });
    await h.shown();
    expect(h.state().pill).toEqual({
      kind: 'request',
      label: t('ai.pill.request'),
      enabled: true,
    });
    await h.pollSleeper.advance(60 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(1);
  });

  it('TC-AIR-013 PROCESSING은 비활성 "AI 분석중"이고 폴링한다', async () => {
    const h = await setup({ routes: { [GET_AI]: PROCESSING } });
    await h.shown();
    expect(h.state().pill).toEqual({
      kind: 'processing',
      label: t('ai.pill.processing'),
      enabled: false,
    });
    await h.pollSleeper.advance(3 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(2);
  });

  it('TC-AIR-014 COMPLETED는 "AI 피드백 보기"만 있고 재요청 버튼이 없으며 폴링하지 않는다', async () => {
    const h = await setup({ routes: { [GET_AI]: COMPLETED } });
    await h.shown();
    expect(h.state().pill).toEqual({ kind: 'view', label: t('ai.pill.view'), enabled: true });
    await h.pollSleeper.advance(60 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(1);
  });

  it('TC-AIR-015 FAILED + canRequestAgain=true는 "AI 피드백 재요청", 누르면 재요청 시트가 열린다', async () => {
    const h = await setup({ routes: { [GET_AI]: FAILED_RETRY } });
    await h.shown();
    expect(h.state().pill).toEqual({ kind: 'retry', label: t('ai.pill.retry'), enabled: true });
    h.viewModel.onPillPress();
    expect(h.state().sheet).toMatchObject({ kind: 'start', title: t('ai.start.title-retry') });
    expect(h.timesOf(POST_AI)).toHaveLength(0);
  });

  it('TC-AIR-015 FAILED + canRequestAgain=false는 "AI 피드백 실패", 실패 시트에 "더 이상 요청할 수 없어요"와 확인만 있다', async () => {
    const h = await setup({ routes: { [GET_AI]: CANNOT_RETRY } });
    await h.shown();
    expect(h.state().pill).toEqual({ kind: 'failed', label: t('ai.pill.failed'), enabled: true });
    h.viewModel.onPillPress();
    expect(h.state().sheet).toEqual({
      kind: 'failed',
      title: t('ai.failed.title'),
      reason: t('ai.failed.no-more'),
      canRetry: false,
      confirmLabel: t('ai.failed.confirm'),
    });
  });

  it('TC-AIR-053 실패 시트는 확인으로 닫히고 자동으로 재요청하지 않는다', async () => {
    const h = await setup({ routes: { [GET_AI]: CANNOT_RETRY } });
    await h.shown();
    h.viewModel.onPillPress();
    h.viewModel.dismissSheet();
    expect(h.state().sheet).toBeNull();
    expect(h.timesOf(POST_AI)).toHaveLength(0);
  });

  it('TC-AIR-016 지난 주제의 내 게시물: NONE이면 알약이 없다', async () => {
    const h = await setup({ topicDate: PAST, routes: { [GET_AI]: NONE } });
    await h.shown();
    expect(h.state().pill).toBeNull();
  });

  it('TC-AIR-016 지난 주제의 내 게시물도 완료 결과와 진행 중은 표시한다', async () => {
    const done = await setup({ topicDate: PAST, routes: { [GET_AI]: COMPLETED } });
    await done.shown();
    expect(done.state().pill?.kind).toBe('view');
    const running = await setup({ topicDate: PAST, routes: { [GET_AI]: PROCESSING } });
    await running.shown();
    expect(running.state().pill?.kind).toBe('processing');
    await running.pollSleeper.advance(3 * SEC);
    expect(running.timesOf(GET_AI)).toHaveLength(2);
  });

  it('TC-AIR-016 지난 주제의 FAILED는 canRequestAgain=true여도 재요청 없이 "오늘 올린 사진만" 안내를 한다', async () => {
    const h = await setup({ topicDate: PAST, routes: { [GET_AI]: FAILED_RETRY } });
    await h.shown();
    expect(h.state().pill?.kind).toBe('failed');
    h.viewModel.onPillPress();
    expect(h.state().sheet).toMatchObject({ kind: 'failed', reason: t('ai.failed.past') });
  });

  it('TC-AIR-016 topicDate를 모르는 시드 상태에서는 새 요청을 열지 않는다', async () => {
    const h = await setup({ topicDate: null, routes: { [GET_AI]: NONE } });
    await h.shown();
    expect(h.state().pill).toBeNull();
  });

  it('TC-AIR-019 완료된 게시물에 재진입하면 GET으로 갱신하되 자동 요청하지 않는다', async () => {
    const h = await setup({ routes: { [GET_AI]: COMPLETED } });
    await h.shown();
    h.viewModel.onHidden();
    await h.shown();
    expect(h.timesOf(GET_AI)).toHaveLength(2);
    expect(h.timesOf(POST_AI)).toHaveLength(0);
  });

  it('TC-AIR-018 홈 표면에서는 같은 게시물의 완료 결과를 복귀 때 다시 조회하지 않는다', async () => {
    const h = await setup({ surface: 'home', routes: { [GET_AI]: COMPLETED } });
    await h.shown();
    h.viewModel.onHidden();
    await h.shown();
    expect(h.timesOf(GET_AI)).toHaveLength(1);
    expect(h.state().card?.message).toBe(t('ai.card.completed'));
  });

  it('TC-AIR-040 첫 GET이 실패하면 "AI 상태 다시 확인"이고 누르면 GET을 다시 보낸다', async () => {
    const h = await setup({ routes: { [GET_AI]: fx('ai-review-get__500-server-error') } });
    await h.shown();
    expect(h.state().pill).toEqual({
      kind: 'recheck',
      label: t('ai.pill.recheck'),
      enabled: true,
    });
    expect(h.toast.messages).toEqual([t('ai.error.load')]);
    h.router.set(GET_AI, COMPLETED);
    h.viewModel.onPillPress();
    await h.pollSleeper.settle();
    expect(h.state().pill?.kind).toBe('view');
  });
});

describe('AiReviewViewModel 시작 시트와 POST (TC-AIR-020~026)', () => {
  it('TC-AIR-020 NONE에서 알약을 누르면 시작 시트(제목·안내 3줄·분석 시작하기)가 뜨고 닫으면 POST 0건이다', async () => {
    const h = await setup();
    await h.shown();
    h.viewModel.onPillPress();
    expect(h.state().sheet).toMatchObject({
      kind: 'start',
      title: t('ai.start.title'),
      lines: [t('ai.start.line1'), t('ai.start.line2'), t('ai.start.line3')],
      confirmLabel: t('ai.start.confirm'),
    });
    h.viewModel.dismissSheet();
    expect(h.state().sheet).toBeNull();
    expect(h.timesOf(POST_AI)).toHaveLength(0);
  });

  it('TC-AIR-020 "분석 시작하기"를 누르면 POST 1회, 시트가 닫히고 분석중이 된다', async () => {
    const h = await setup({ routes: { [GET_AI]: [NONE, PROCESSING], [POST_AI]: POST_202 } });
    await h.shown();
    h.viewModel.onPillPress();
    await h.viewModel.confirmStart();
    expect(h.timesOf(POST_AI)).toHaveLength(1);
    expect(h.state().sheet).toBeNull();
    expect(h.state().pill?.kind).toBe('processing');
  });

  it('TC-AIR-022 POST 응답을 기다리는 동안 알약은 비활성 "AI 요청중"이다', async () => {
    const slow = gate(fx('ai-review-post__202-processing'));
    const h = await setup({ routes: { [POST_AI]: slow.route } });
    await h.shown();
    h.viewModel.onPillPress();
    const pending = h.viewModel.confirmStart();
    await h.pollSleeper.settle();
    expect(h.state().pill).toEqual({
      kind: 'requesting',
      label: t('ai.pill.requesting'),
      enabled: false,
    });
    slow.release();
    await pending;
  });

  it('TC-AIR-023 확인 버튼 연타·중복 탭에도 POST는 1건이다', async () => {
    const slow = gate(fx('ai-review-post__202-processing'));
    const h = await setup({ routes: { [POST_AI]: slow.route } });
    await h.shown();
    h.viewModel.onPillPress();
    const first = h.viewModel.confirmStart();
    void h.viewModel.confirmStart();
    void h.viewModel.confirmStart();
    h.viewModel.onPillPress();
    slow.release();
    await first;
    expect(h.timesOf(POST_AI)).toHaveLength(1);
  });

  it('TC-AIR-024 이미 완료된 리뷰에 POST하면 200 COMPLETED를 표시하되 결과 시트는 자동으로 열지 않는다', async () => {
    const h = await setup({ routes: { [POST_AI]: fx('ai-review-post__200-completed') } });
    await h.shown();
    h.viewModel.onPillPress();
    await h.viewModel.confirmStart();
    expect(h.state().pill?.kind).toBe('view');
    expect(h.state().sheet).toBeNull();
  });

  it('TC-AIR-020 홈 카드의 실패 재요청은 시작 시트 없이 바로 POST한다', async () => {
    const h = await setup({
      surface: 'home',
      routes: { [GET_AI]: [FAILED_RETRY, PROCESSING], [POST_AI]: POST_202 },
    });
    await h.shown();
    expect(h.state().card?.action).toEqual({ kind: 'retry', label: t('ai.card.retry') });
    await h.viewModel.onCardActionPress();
    expect(h.state().sheet).toBeNull();
    expect(h.timesOf(POST_AI)).toHaveLength(1);
  });

  it('TC-AIR-020 홈 카드의 NONE은 시작 시트를 거치고, 상세의 재요청은 재요청 시트를 거친다', async () => {
    const home = await setup({ surface: 'home' });
    await home.shown();
    await home.viewModel.onCardActionPress();
    expect(home.state().sheet).toMatchObject({ kind: 'start', title: t('ai.start.title') });
    expect(home.timesOf(POST_AI)).toHaveLength(0);
  });

  it('TC-AIR-026 POST 400이면 서버 message를 보이고 이전 단계 알약으로 돌아간다', async () => {
    const h = await setup({
      routes: {
        [GET_AI]: FAILED_RETRY,
        [POST_AI]: fx('ai-review-post__400-limit-reached'),
      },
    });
    await h.shown();
    h.viewModel.onPillPress();
    await h.viewModel.confirmStart();
    expect(h.toast.messages).toEqual(['더 이상 AI 리뷰를 다시 요청할 수 없습니다.']);
    expect(h.state().pill?.kind).toBe('retry');
    expect(h.state().sheet).toBeNull();
  });

  it('TC-AIR-028 POST 404면 알약을 숨긴다', async () => {
    const h = await setup({ routes: { [POST_AI]: fx('ai-review-post__404-not-found') } });
    await h.shown();
    h.viewModel.onPillPress();
    await h.viewModel.confirmStart();
    expect(h.state().pill).toBeNull();
    expect(h.toast.messages).toEqual([t('ai.error.not-found')]);
  });

  it('TC-AIR-029 POST 401(남은 UNAUTHORIZED)이면 AuthErrorPolicy대로 로그인으로 보낸다', async () => {
    const h = await setup({ routes: { [POST_AI]: unauthorized() } });
    await h.shown();
    h.viewModel.onPillPress();
    await h.viewModel.confirmStart();
    expect(h.authFlow.calls).toEqual(['login']);
    expect(h.toast.messages).toEqual([]);
  });
});

describe('AiReviewViewModel 오늘 판정과 자정 (TC-AIR-045, D-23)', () => {
  const BEFORE_MIDNIGHT = '2026-10-27T14:59:59Z';

  it('TC-AIR-045 KST 23:59:59에는 요청 버튼이 보인다', async () => {
    const h = await setup({ now: BEFORE_MIDNIGHT });
    await h.shown();
    expect(h.state().pill?.kind).toBe('request');
  });

  it('TC-AIR-045 시트를 연 채 KST 00:00:00이 지나면 "분석 시작하기"는 POST를 보내지 않고 버튼이 숨는다', async () => {
    const h = await setup({ now: BEFORE_MIDNIGHT });
    await h.shown();
    h.viewModel.onPillPress();
    h.clock.advance(1 * SEC);
    await h.viewModel.confirmStart();
    expect(h.timesOf(POST_AI)).toHaveLength(0);
    expect(h.state().sheet).toBeNull();
    expect(h.state().pill).toBeNull();
  });

  it('TC-AIR-045 자정 뒤에는 알약을 눌러도 시트가 열리지 않는다', async () => {
    const h = await setup({ now: BEFORE_MIDNIGHT, routes: { [GET_AI]: FAILED_RETRY } });
    await h.shown();
    h.clock.advance(1 * SEC);
    h.viewModel.onPillPress();
    expect(h.state().sheet).toBeNull();
    expect(h.timesOf(POST_AI)).toHaveLength(0);
  });

  it('TC-AIR-045 이미 진행 중인 리뷰의 결과 조회는 자정 뒤에도 계속된다', async () => {
    const h = await setup({
      now: BEFORE_MIDNIGHT,
      routes: { [GET_AI]: [PROCESSING, PROCESSING, COMPLETED] },
    });
    await h.shown();
    await h.pollSleeper.advance(6 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(3);
    expect(h.state().pill?.kind).toBe('view');
  });
});

describe('AiReviewViewModel 폴링 창 종료 (TC-AIR-035~037)', () => {
  it('TC-AIR-035 300초가 지나면 "AI 분석중"을 유지한 채 안내 문구를 보이고 POST는 0건이다', async () => {
    const h = await setup({ routes: { [GET_AI]: PROCESSING } });
    await h.shown();
    await h.pollSleeper.advance(300 * SEC);
    expect(h.state().pill?.kind).toBe('processing');
    expect(h.state().notice).toEqual({ message: t('ai.poll.timeout'), canRecheck: true });
    expect(h.timesOf(POST_AI)).toHaveLength(0);
  });

  it('TC-AIR-037 "AI 상태 다시 확인"을 누르면 GET 1회, PROCESSING이면 폴링을 재개하고 안내는 사라진다', async () => {
    const h = await setup({ routes: { [GET_AI]: PROCESSING } });
    await h.shown();
    await h.pollSleeper.advance(300 * SEC);
    const before = h.timesOf(GET_AI).length;
    h.viewModel.onRecheckPress();
    await h.pollSleeper.settle();
    expect(h.timesOf(GET_AI)).toHaveLength(before + 1);
    expect(h.state().notice).toBeNull();
    await h.pollSleeper.advance(3 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(before + 2);
  });

  it('TC-AIR-036 창 종료 뒤 화면을 나갔다 다시 들어오면 GET부터 새 창이 열린다', async () => {
    const h = await setup({ routes: { [GET_AI]: PROCESSING } });
    await h.shown();
    await h.pollSleeper.advance(300 * SEC);
    h.viewModel.onHidden();
    await h.shown();
    expect(h.state().notice).toBeNull();
    expect(h.timesOf(POST_AI)).toHaveLength(0);
  });
});

describe('AiReviewViewModel 화면 이탈 (TC-AIR-042)', () => {
  it('TC-AIR-042 앱이 백그라운드로 가면 폴링을 멈추고 복귀하면 GET부터 새 창을 시작한다', async () => {
    const h = await setup({ routes: { [GET_AI]: PROCESSING } });
    await h.shown();
    await h.pollSleeper.advance(3 * SEC);
    h.visibility.emit('background');
    await h.pollSleeper.advance(120 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(2);
    h.visibility.emit('foreground');
    await h.pollSleeper.settle();
    expect(h.timesOf(GET_AI)).toHaveLength(3);
    await h.pollSleeper.advance(3 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(4);
  });

  it('TC-AIR-042 onHidden이면 폴링을 멈추고 가시성 구독을 해제하며 이후 응답은 상태를 바꾸지 않는다', async () => {
    const late = gate(COMPLETED);
    const h = await setup({ routes: { [GET_AI]: late.route } });
    void h.viewModel.onShown();
    await h.pollSleeper.settle();
    h.viewModel.onHidden();
    expect(h.visibility.listenerCount).toBe(0);
    late.release();
    await h.pollSleeper.settle();
    expect(h.state().pill?.kind).not.toBe('view');
  });

  it('TC-AIR-042 dispose하면 폴링이 멈춘다', async () => {
    const h = await setup({ routes: { [GET_AI]: PROCESSING } });
    await h.shown();
    h.viewModel.dispose();
    await h.pollSleeper.advance(60 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(1);
    expect(h.visibility.listenerCount).toBe(0);
  });
});

describe('AiReviewViewModel 결과 시트 (TC-AIR-049~052)', () => {
  async function openResult(fixture = COMPLETED) {
    const h = await setup({ routes: { [GET_AI]: fixture } });
    await h.shown();
    h.viewModel.onPillPress();
    const sheet = h.state().sheet;
    if (sheet?.kind !== 'result') throw new Error(`result sheet expected, got ${sheet?.kind}`);
    return { h, sheet };
  }

  it('TC-AIR-049 한 줄 요약·구도 점수·criteria·섹션 3개가 이 순서로 담긴다', async () => {
    const { sheet } = await openResult();
    expect(sheet.summary).toBe('빛을 따라 시선이 흐르는 안정적인 구도');
    expect(sheet.scoreText).toBe('7.5');
    expect(sheet.criteria).toEqual([{ key: 'COMPOSITION', label: '구도', scoreText: '7.5' }]);
    expect(sheet.sections.map((s) => s.title)).toEqual([
      t('ai.result.strength'),
      t('ai.result.weakness'),
      t('ai.result.suggestion'),
    ]);
    expect(sheet.sections.map((s) => s.body)).toEqual([
      '빛이 들어오는 방향을 따라 시선이 자연스럽게 이어집니다.',
      '수평선이 살짝 기울어 안정감이 조금 떨어집니다.',
      '카메라를 낮추고 수평선을 맞춰 한 번 더 찍어 보세요.',
    ]);
  });

  it.each([
    ['completed-score-0', '0.0'],
    ['completed-score-10', '10.0'],
  ])('TC-AIR-049 점수는 소수 첫째 자리로 표시한다(%s -> %s)', async (name, text) => {
    const { sheet } = await openResult(fx(`ai-review-get__${name}`));
    expect(sheet.scoreText).toBe(text);
  });

  it('TC-AIR-010 criteria는 개수를 고정하지 않고 응답 순서대로 목록이 된다(3개)', async () => {
    const { sheet } = await openResult(fx('ai-review-get__completed-long-text'));
    expect(sheet.criteria).toHaveLength(3);
  });

  it('TC-AIR-050 점수 접근성 라벨은 "전체 점수 10점 만점에 7.5점"이다', async () => {
    const { sheet } = await openResult();
    expect(sheet.scoreA11yLabel).toBe('전체 점수 10점 만점에 7.5점');
  });

  it('TC-AIR-051 distinctivePerspective가 true일 때만 배지 문구가 있다', async () => {
    const yes = await openResult();
    expect(yes.sheet.distinctiveBadge).toBe(t('ai.result.distinctive'));
    const no = await openResult(fx('ai-review-get__completed-not-distinct'));
    expect(no.sheet.distinctiveBadge).toBeNull();
  });

  it('TC-AIR-052 기준 설명 다이얼로그를 열고 닫을 수 있다', async () => {
    const { h } = await openResult();
    h.viewModel.openCriteriaDialog();
    expect(h.state().criteriaDialogOpen).toBe(true);
    h.viewModel.closeCriteriaDialog();
    expect(h.state().criteriaDialogOpen).toBe(false);
  });
});

describe('AiReviewViewModel 푸시 진입 자동 오픈 (TC-AIR-058, D-11)', () => {
  it('TC-AIR-058 COMPLETED면 결과 시트가 한 번 열리고, 닫은 뒤 다시 들어와도 다시 열리지 않는다', async () => {
    const h = await setup({ entry: 'push', routes: { [GET_AI]: COMPLETED } });
    await h.shown();
    expect(h.state().sheet?.kind).toBe('result');
    h.viewModel.dismissSheet();
    h.viewModel.onHidden();
    await h.shown();
    expect(h.state().sheet).toBeNull();
  });

  it('TC-AIR-058 FAILED면 실패 시트가 한 번 열린다', async () => {
    const h = await setup({ entry: 'push', routes: { [GET_AI]: FAILED_RETRY } });
    await h.shown();
    expect(h.state().sheet).toMatchObject({ kind: 'failed' });
  });

  it.each([
    ['PROCESSING', PROCESSING],
    ['NONE', NONE],
  ])('TC-AIR-058 최신 GET이 %s이면 시트를 열지 않는다', async (_name, fixture) => {
    const h = await setup({ entry: 'push', routes: { [GET_AI]: fixture } });
    await h.shown();
    expect(h.state().sheet).toBeNull();
  });

  it('TC-AIR-058 푸시로 열린 실패 시트가 재요청 가능이면 사유 없이 재요청 버튼이 있고 누르면 재요청 시트로 이어진다', async () => {
    const h = await setup({ entry: 'push', routes: { [GET_AI]: FAILED_RETRY } });
    await h.shown();
    expect(h.state().sheet).toMatchObject({ kind: 'failed', reason: null, canRetry: true });
    h.viewModel.onFailedSheetRetry();
    expect(h.state().sheet).toMatchObject({ kind: 'start', retry: true });
    expect(h.timesOf(POST_AI)).toHaveLength(0);
  });

  it('TC-AIR-058 일반 진입에서는 자동으로 열리지 않는다', async () => {
    const h = await setup({ entry: 'normal', routes: { [GET_AI]: COMPLETED } });
    await h.shown();
    expect(h.state().sheet).toBeNull();
  });

  it('TC-AIR-058 푸시 진입이어도 시트는 최신 GET 결과를 기다린 뒤 연다(GET 전에는 열지 않는다)', async () => {
    const slow = gate(COMPLETED);
    const h = await setup({ entry: 'push', routes: { [GET_AI]: slow.route } });
    void h.viewModel.onShown();
    await h.pollSleeper.settle();
    expect(h.state().sheet).toBeNull();
    slow.release();
    await h.pollSleeper.settle();
    expect(h.state().sheet?.kind).toBe('result');
  });
});

describe('AiReviewViewModel 홈 카드 (REQ-AIR-052)', () => {
  const cardOf = async (fixture: string) => {
    const h = await setup({ surface: 'home', routes: { [GET_AI]: fixture } });
    await h.shown();
    return h.state().card;
  };

  it('NONE은 "이 사진, AI에게 피드백 받아보기"와 시작 시트 진입이다', async () => {
    expect(await cardOf(NONE)).toEqual({
      message: t('ai.card.request'),
      action: { kind: 'start', label: t('ai.card.request') },
    });
  });

  it('PROCESSING은 "AI 피드백이 진행중이에요"이고 버튼이 없다', async () => {
    expect(await cardOf(PROCESSING)).toEqual({ message: t('ai.card.processing'), action: null });
  });

  it('COMPLETED는 "AI 피드백이 완료되었어요"와 "자세히 보기"다', async () => {
    expect(await cardOf(COMPLETED)).toEqual({
      message: t('ai.card.completed'),
      action: { kind: 'detail', label: t('ai.card.detail') },
    });
  });

  it('FAILED는 canRequestAgain=true일 때만 "재요청"을 보인다', async () => {
    expect(await cardOf(FAILED_RETRY)).toEqual({
      message: t('ai.card.failed'),
      action: { kind: 'retry', label: t('ai.card.retry') },
    });
    expect(await cardOf(CANNOT_RETRY)).toEqual({ message: t('ai.card.failed'), action: null });
  });

  it('GET 404면 카드를 숨긴다(REQ-HOME-035)', async () => {
    expect(await cardOf(fx('ai-review-get__404-not-found'))).toBeNull();
  });
});

describe('AiReviewViewModel 용어 (TC-AIR-054)', () => {
  it('화면에 보이는 모든 문구는 "AI 피드백"으로 통일돼 "AI 리뷰"가 없다(서버 message 제외)', async () => {
    const seen: string[] = [];
    for (const fixture of [NONE, PROCESSING, COMPLETED, FAILED_RETRY, CANNOT_RETRY]) {
      for (const surface of ['feed', 'home'] as const) {
        const h = await setup({ surface, routes: { [GET_AI]: fixture } });
        await h.shown();
        h.viewModel.onPillPress();
        seen.push(...strings(h.state()));
      }
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.filter((s) => s.includes('AI 리뷰'))).toEqual([]);
  });
});
