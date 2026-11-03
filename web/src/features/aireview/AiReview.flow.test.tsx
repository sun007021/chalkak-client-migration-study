import { vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { t } from '../../copy/ko';
import { AI_POST_ID, aiGet, aiPost, getFx, postFx } from '../../test/aiReviewHarness';
import { MINE } from '../../test/postRoutes';
import { advance, openApp } from '../../test/postScreens';
import { FeedAiViewModel } from './FeedAiViewModel';
import { AiReviewStore } from './AiReviewStore';
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

describe('홈 ↔ 상세 AI 상태 공유 (REQ-AIR-050, 051, TC-AIR-018)', () => {
  it('REQ-HOME-035 REQ-AIR-047 홈 "자세히 보기"로 상세에 들어오면 결과 시트가 자동으로 열리고, 닫으면 알약만 남는다', async () => {
    const { router } = await openApp({ path: '/home', routes: { [aiGet()]: getFx('completed') } });
    fireEvent.click(await screen.findByTestId('home.ai-detail-button'));
    expect(await screen.findByTestId('ai-result-sheet.root')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/feed/${AI_POST_ID}`);
    expect(tid('ai-result-sheet.overall-score')).toHaveTextContent('7.5');
    fireEvent.click(tid('ai-result-sheet.close-button'));
    await waitFor(() => expect(maybe('ai-result-sheet.root')).not.toBeInTheDocument());
    expect(tid('feed.ai-result-button')).toBeInTheDocument();
  });

  it('REQ-AIR-047 상세로 그냥 들어오면(일반 이동) 완료 상태여도 결과 시트는 열리지 않는다', async () => {
    const { h } = await openApp({
      path: { pathname: `/feed/${MINE}`, state: { seed: seedMine } },
      routes: { [aiGet()]: getFx('completed') },
    });
    await screen.findByTestId('feed.ai-result-button');
    await advance(h, 500);
    expect(maybe('ai-result-sheet.root')).not.toBeInTheDocument();
  });

  it('상세에서 요청하고 홈으로 돌아오면 홈 카드가 진행 중이고, 홈이 3초 간격으로 폴링해 완료로 바뀐다', async () => {
    const { h, router } = await openApp({
      path: { pathname: `/feed/${MINE}`, state: { seed: seedMine } },
      routes: { [aiGet()]: [getFx('none'), getFx('processing'), getFx('completed')], [aiPost()]: postFx('202-processing') },
    });
    fireEvent.click(await screen.findByTestId('feed.ai-request-button'));
    fireEvent.click(await screen.findByTestId('ai-start-sheet.start-button'));
    await screen.findByTestId('feed.ai-processing');
    fireEvent.click(tid('feed.back-button'));
    await screen.findByTestId('home.root');
    expect(router.state.location.pathname).toBe('/home');
    expect(await screen.findByTestId('home.ai-processing')).toHaveTextContent(t('ai.card.processing'));
    await advance(h, 3_000);
    expect(await screen.findByTestId('home.ai-completed')).toBeInTheDocument();
  });

  it('REQ-AIR-050 홈에서 요청한 진행 중 상태를 상세 알약이 이어받는다', async () => {
    const { router } = await openApp({
      path: '/home',
      routes: { [aiGet()]: [getFx('none'), getFx('processing')], [aiPost()]: postFx('202-processing') },
    });
    fireEvent.click(await screen.findByTestId('home.ai-request-button'));
    fireEvent.click(await screen.findByTestId('ai-start-sheet.start-button'));
    await screen.findByTestId('home.ai-processing');
    await act(async () => {
      await router.navigate(`/feed/${MINE}`, { state: { seed: seedMine } });
    });
    expect(await screen.findByTestId('feed.ai-processing')).toBeInTheDocument();
  });
});

describe('컨테이너 연결 (UserCaches, 계정 전환)', () => {
  it('container.aiReviews는 AiReviewStore이고 createFeedAiViewModel은 FeedAiViewModel을 만든다', async () => {
    const { h } = await openApp({ path: '/home' });
    expect(h.container.aiReviews).toBeInstanceOf(AiReviewStore);
    const vm = h.container.createFeedAiViewModel({ postId: MINE, openAiReview: false });
    expect(vm).toBeInstanceOf(FeedAiViewModel);
    vm.dispose();
  });

  it('TC-AIR-044 계정 전환(UserCaches.clearAll) 때 저장소가 비워지고 진행 중이던 폴링이 멈춘다', async () => {
    const { h, fixtures } = await openApp({
      path: { pathname: `/feed/${MINE}`, state: { seed: seedMine } },
      routes: { [aiGet()]: getFx('processing') },
    });
    await screen.findByTestId('feed.ai-processing');
    expect(h.container.aiReviews.entry(MINE)).not.toBeNull();
    await act(async () => {
      await h.container.userCaches.clearAll();
    });
    expect(h.container.aiReviews.entry(MINE)).toBeNull();
    const before = fixtures.calls(aiGet()).length;
    await advance(h, 30_000);
    expect(fixtures.calls(aiGet()).length).toBe(before);
  });
});
