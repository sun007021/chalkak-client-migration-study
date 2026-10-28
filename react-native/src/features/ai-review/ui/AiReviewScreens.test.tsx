import { fireEvent, render, screen, act } from '@testing-library/react-native';

import { d } from '../../../core/time/__testing__/helpers';
import { t } from '../../../shared/copy';
import {
  COMPLETED,
  FAILED_RETRY,
  GET_AI,
  NONE,
  POST_AI,
  POST_ID,
  PROCESSING,
  createAiReviewHarness,
  fx,
  type AiReviewHarnessOptions,
} from '../__testing__/createAiReviewHarness';
import { AiReviewViewModel } from '../AiReviewViewModel';
import { AiReviewCard } from './AiReviewCard';
import { AiReviewSection } from './AiReviewSection';

async function mount(
  options: AiReviewHarnessOptions,
  surface: 'feed' | 'home',
  render_: (vm: AiReviewViewModel) => React.ReactElement,
) {
  const h = await createAiReviewHarness(options);
  const viewModel = new AiReviewViewModel({
    target: { postId: POST_ID, topicDate: d('2026-10-27'), isMine: true },
    mode: 'member',
    surface,
    entry: 'normal',
    clock: h.clock,
    poller: h.poller,
    visibility: h.visibility,
  });
  await render(render_(viewModel));
  await act(async () => h.pollSleeper.settle());
  return h;
}

const section = (vm: AiReviewViewModel) => <AiReviewSection viewModel={vm} />;
const card = (vm: AiReviewViewModel) => <AiReviewCard viewModel={vm} />;

describe('AiReviewSection (상세 알약과 시트)', () => {
  it('TC-AIR-012 TC-AIR-057 NONE이면 "AI 피드백 받기" 알약이 있고 누르면 시작 시트가 뜬다', async () => {
    await mount({ routes: { [GET_AI]: NONE } }, 'feed', section);
    expect(screen.getByText(t('ai.pill.request'))).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('feed.ai-request-button'));
    for (const id of [
      'ai-start-sheet.root',
      'ai-start-sheet.description',
      'ai-start-sheet.start-button',
      'ai-start-sheet.close-button',
    ]) {
      expect(screen.getByTestId(id)).toBeOnTheScreen();
    }
    expect(screen.getByText(t('ai.start.title'))).toBeOnTheScreen();
  });

  it('TC-AIR-020 시트를 닫으면 POST가 없고, "분석 시작하기"를 누르면 POST 1회 뒤 분석중이 된다', async () => {
    const h = await mount({ routes: { [GET_AI]: [NONE, PROCESSING] } }, 'feed', section);
    await fireEvent.press(screen.getByTestId('feed.ai-request-button'));
    await fireEvent.press(screen.getByTestId('ai-start-sheet.close-button'));
    expect(h.timesOf(POST_AI)).toHaveLength(0);
    await fireEvent.press(screen.getByTestId('feed.ai-request-button'));
    await act(async () => {
      await fireEvent.press(screen.getByTestId('ai-start-sheet.start-button'));
      await h.pollSleeper.settle();
    });
    expect(h.timesOf(POST_AI)).toHaveLength(1);
    expect(screen.getByTestId('feed.ai-processing')).toBeOnTheScreen();
  });

  it('TC-AIR-049 TC-AIR-050 TC-AIR-051 TC-AIR-052 결과 시트: 점수, 기준, 배지, 요약, 세 섹션, 기준 다이얼로그', async () => {
    await mount({ routes: { [GET_AI]: COMPLETED } }, 'feed', section);
    await fireEvent.press(screen.getByTestId('feed.ai-result-button'));
    expect(screen.getByTestId('ai-result-sheet.overall-score')).toHaveAccessibleName(
      '전체 점수 10점 만점에 7.5점',
    );
    for (const id of [
      'ai-result-sheet.criteria-item-COMPOSITION',
      'ai-result-sheet.distinctive-badge',
      'ai-result-sheet.feedback-summary',
      'ai-result-sheet.feedback-strength',
      'ai-result-sheet.feedback-weakness',
      'ai-result-sheet.feedback-suggestion',
    ]) {
      expect(screen.getByTestId(id)).toBeOnTheScreen();
    }
    await fireEvent.press(screen.getByTestId('ai-result-sheet.criteria-info-button'));
    expect(screen.getByTestId('ai-result-sheet.criteria-dialog')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('ai-result-sheet.criteria-close-button'));
    expect(screen.queryByTestId('ai-result-sheet.criteria-dialog')).not.toBeOnTheScreen();
  });

  it('TC-AIR-051 distinctivePerspective=false면 배지가 없다', async () => {
    await mount(
      { routes: { [GET_AI]: fx('ai-review-get__completed-not-distinct') } },
      'feed',
      section,
    );
    await fireEvent.press(screen.getByTestId('feed.ai-result-button'));
    expect(screen.queryByTestId('ai-result-sheet.distinctive-badge')).not.toBeOnTheScreen();
  });

  it('TC-AIR-053 재요청 불가 실패 시트: 제목, 사유, 확인만 있고 재요청 버튼이 없다', async () => {
    await mount(
      { routes: { [GET_AI]: fx('ai-review-get__failed-cannot-retry') } },
      'feed',
      section,
    );
    await fireEvent.press(screen.getByTestId('feed.ai-failed-button'));
    expect(screen.getByText(t('ai.failed.title'))).toBeOnTheScreen();
    expect(screen.getByTestId('ai-failed-sheet.message')).toHaveTextContent(t('ai.failed.no-more'));
    expect(screen.queryByTestId('ai-failed-sheet.retry-button')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('ai-failed-sheet.confirm-button'));
    expect(screen.queryByTestId('ai-failed-sheet.root')).not.toBeOnTheScreen();
  });

  it('TC-AIR-015 재요청 가능한 실패는 "AI 피드백 재요청" 알약이다', async () => {
    await mount({ routes: { [GET_AI]: FAILED_RETRY } }, 'feed', section);
    expect(screen.getByTestId('feed.ai-retry-button')).toBeOnTheScreen();
  });

  it('TC-AIR-037 창 종료 안내와 "AI 상태 다시 확인" 버튼이 보인다', async () => {
    const h = await mount({ routes: { [GET_AI]: PROCESSING } }, 'feed', section);
    await act(async () => h.pollSleeper.advance(300_000));
    expect(screen.getByTestId('feed.ai-message')).toHaveTextContent(t('ai.poll.timeout'));
    expect(screen.getByTestId('feed.ai-recheck-button')).toBeOnTheScreen();
  });

  it('TC-AIR-017 404면 아무것도 그리지 않는다', async () => {
    await mount({ routes: { [GET_AI]: fx('ai-review-get__404-not-found') } }, 'feed', section);
    expect(screen.queryByTestId('feed.ai-request-button')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('feed.ai-checking')).not.toBeOnTheScreen();
  });
});

describe('AiReviewCard (홈 카드)', () => {
  it('TC-AIR-057 NONE 카드의 요청 버튼, PROCESSING 카드의 진행 중, COMPLETED 카드의 자세히 보기', async () => {
    await mount({ routes: { [GET_AI]: NONE } }, 'home', card);
    expect(screen.getByTestId('home.ai-request-button')).toBeOnTheScreen();
  });

  it('PROCESSING은 버튼 없이 진행 중 문구다', async () => {
    await mount({ routes: { [GET_AI]: PROCESSING } }, 'home', card);
    expect(screen.getByTestId('home.ai-processing')).toHaveTextContent(t('ai.card.processing'));
    expect(screen.queryByTestId('home.ai-request-button')).not.toBeOnTheScreen();
  });

  it('COMPLETED는 "자세히 보기"로 결과 시트를 연다', async () => {
    await mount({ routes: { [GET_AI]: COMPLETED } }, 'home', card);
    expect(screen.getByTestId('home.ai-completed')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('home.ai-detail-button'));
    expect(screen.getByTestId('ai-result-sheet.root')).toBeOnTheScreen();
  });

  it('TC-AIR-020 FAILED 재요청은 시트 없이 바로 POST한다', async () => {
    const h = await mount({ routes: { [GET_AI]: [FAILED_RETRY, PROCESSING] } }, 'home', card);
    expect(screen.getByTestId('home.ai-failed')).toBeOnTheScreen();
    await act(async () => {
      await fireEvent.press(screen.getByTestId('home.ai-retry-button'));
      await h.pollSleeper.settle();
    });
    expect(screen.queryByTestId('ai-start-sheet.root')).not.toBeOnTheScreen();
    expect(h.timesOf(POST_AI)).toHaveLength(1);
  });
});
