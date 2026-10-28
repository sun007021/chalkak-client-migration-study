import { useCallback } from 'react';

import { todayKst } from '../core/time/kst';
import type { KstDate } from '../core/time/KstDate';
import { AiReviewCard } from '../features/ai-review/ui/AiReviewCard';
import { AiReviewSection } from '../features/ai-review/ui/AiReviewSection';
import { useAppContainer } from './AppContainerContext';
import { useOwnedViewModel } from './useOwnedViewModel';

/**
 * 상세의 AI 피드백 알약 소유자. ViewModel은 게시물 하나마다 만들고 이 컴포넌트가 사라질 때 dispose한다.
 * 상세 응답으로 내 게시물과 주제 날짜가 확정된 뒤에만 그려진다(FeedScreen의 renderAiReview).
 */
export function FeedAiReview({ postId, topicDate }: { postId: string; topicDate: KstDate }) {
  const container = useAppContainer();
  if (!container.aiReviewUiAvailable) return null;
  return <OwnedFeedAiReview key={postId} postId={postId} topicDate={topicDate} />;
}

function OwnedFeedAiReview({ postId, topicDate }: { postId: string; topicDate: KstDate }) {
  const container = useAppContainer();
  const create = useCallback(
    () =>
      container.createAiReviewViewModel({
        target: { postId, topicDate, isMine: true },
        surface: 'feed',
      }),
    [container, postId, topicDate],
  );
  const viewModel = useOwnedViewModel(create);
  return viewModel ? <AiReviewSection viewModel={viewModel} /> : null;
}

/** 홈 AI 카드 소유자. 카드는 오늘 승인된 내 사진일 때만 그려지므로 주제 날짜는 오늘이다. */
export function HomeAiCard({ postId }: { postId: string }) {
  const container = useAppContainer();
  if (!container.aiReviewUiAvailable) return null;
  return <OwnedHomeAiCard key={postId} postId={postId} />;
}

function OwnedHomeAiCard({ postId }: { postId: string }) {
  const container = useAppContainer();
  const create = useCallback(
    () =>
      container.createAiReviewViewModel({
        target: { postId, topicDate: todayKst(container.clock), isMine: true },
        surface: 'home',
      }),
    [container, postId],
  );
  const viewModel = useOwnedViewModel(create);
  return viewModel ? <AiReviewCard viewModel={viewModel} /> : null;
}
