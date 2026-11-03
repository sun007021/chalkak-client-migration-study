import { vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { t } from '../../copy/ko';
import { aiGet, aiPost, getFx, postFx } from '../../test/aiReviewHarness';
import { MINE } from '../../test/postRoutes';
import { openApp } from '../../test/postScreens';
import type { PostSeed } from '../post/postModels';

vi.setConfig({ testTimeout: 15_000 });

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

async function openMine(routes: NonNullable<Parameters<typeof openApp>[0]>['routes'] = {}, state: Record<string, unknown> = {}) {
  const view = await openApp({ path: { pathname: `/feed/${MINE}`, state: { seed: seedMine, ...state } }, routes });
  await waitFor(() => expect(tid('feed.like-button')).toBeEnabled());
  return view;
}

describe('상세 AI 화면 코드리뷰 회귀', () => {
  it('리뷰7 종합 점수는 접근성 이름 "전체 점수 10점 만점에 7.5점"인 이미지로 노출된다', async () => {
    await openMine({ [aiGet()]: getFx('completed') });
    fireEvent.click(await screen.findByTestId('feed.ai-result-button'));
    expect(await screen.findByRole('img', { name: t('ai.result.score-a11y', { X: '7.5' }) })).toHaveTextContent('7.5');
  });

  it('리뷰11 자동 열기를 소비하면 history state에서 openAiReview만 지워지고 seed는 남으며 시트는 닫히지 않는다', async () => {
    const { router } = await openMine({ [aiGet()]: getFx('completed') }, { openAiReview: true });
    await screen.findByTestId('ai-result-sheet.root');
    await waitFor(() => expect(router.state.location.state).not.toHaveProperty('openAiReview'));
    expect(router.state.location.state).toHaveProperty('seed');
    expect(router.state.location.pathname).toBe(`/feed/${MINE}`);
    expect(maybe('ai-result-sheet.root')).toBeInTheDocument();
  });

  it('리뷰11 해당 없음(GET none)이어도 소비하고, 일반 진입은 state를 건드리지 않는다', async () => {
    const { router } = await openMine({ [aiGet()]: getFx('none') }, { openAiReview: true });
    await screen.findByTestId('feed.ai-request-button');
    await waitFor(() => expect(router.state.location.state).not.toHaveProperty('openAiReview'));
    const plain = await openMine();
    await screen.findAllByTestId('feed.ai-request-button');
    expect(plain.router.state.location.state).toHaveProperty('seed');
  });

  it('리뷰12 기준 안내 다이얼로그가 열려 있으면 Tab은 그 안에서만 돌고 Esc는 그것만 닫는다', async () => {
    await openMine({ [aiGet()]: getFx('completed') });
    fireEvent.click(await screen.findByTestId('feed.ai-result-button'));
    await screen.findByTestId('ai-result-sheet.root');
    fireEvent.click(tid('ai-result-sheet.criteria-info-button'));
    const dialog = await screen.findByTestId('ai-result-sheet.criteria-dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(maybe('ai-result-sheet.criteria-dialog')).not.toBeInTheDocument());
    expect(maybe('ai-result-sheet.root')).toBeInTheDocument();
    expect(tid('ai-result-sheet.root').contains(document.activeElement)).toBe(true);
  });

  it('리뷰13 알약 상태와 안내는 role=status 영역 안에 있다', async () => {
    await openMine({ [aiGet()]: getFx('processing') });
    const processing = await screen.findByTestId('feed.ai-processing');
    expect(processing.closest('[role="status"]')).not.toBeNull();
  });

  it('리뷰13 요청 시트를 확정해 트리거 알약이 사라지면 포커스가 알약 영역으로 간다(body로 떨어지지 않는다)', async () => {
    await openMine({ [aiPost()]: postFx('202-processing') });
    fireEvent.click(await screen.findByTestId('feed.ai-request-button'));
    fireEvent.click(await screen.findByTestId('ai-start-sheet.start-button'));
    const processing = await screen.findByTestId('feed.ai-processing');
    await waitFor(() => expect(document.activeElement).toBe(processing.closest('[role="status"]')));
  });
});
