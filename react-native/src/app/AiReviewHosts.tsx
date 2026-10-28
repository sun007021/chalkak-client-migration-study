import type { KstDate } from '../core/time/KstDate';
import { AiReviewCard } from '../features/ai-review/ui/AiReviewCard';
import { AiReviewSection } from '../features/ai-review/ui/AiReviewSection';
import { useAppContainer } from './AppContainerContext';
import { OwnedViewModelHost } from './OwnedViewModelHost';

type Surface = 'feed' | 'home';

/**
 * AI 피드백 ViewModel 소유자. 게시물(과 주제 날짜)마다 만들고 이 컴포넌트가 사라질 때 dispose한다.
 * 화면용 폴러가 없으면(테스트 Fake) 아무것도 그리지 않는다.
 */
function AiReviewHost({
  postId,
  topicDate,
  surface,
  entry = 'normal',
}: {
  postId: string;
  topicDate: KstDate;
  surface: Surface;
  /** push: 푸시 탭으로 들어왔다. 최신 결과가 확인되면 시트를 한 번 자동으로 연다(D-11). */
  entry?: 'normal' | 'push';
}) {
  const container = useAppContainer();
  if (!container.aiReviewSession) return null;
  return (
    <OwnedViewModelHost
      key={`${postId}:${topicDate.toString()}`}
      create={() =>
        container.createAiReviewViewModel({
          target: { postId, topicDate, isMine: true },
          surface,
          entry,
        })
      }
    >
      {(viewModel) =>
        surface === 'feed' ? (
          <AiReviewSection viewModel={viewModel} />
        ) : (
          <AiReviewCard viewModel={viewModel} />
        )
      }
    </OwnedViewModelHost>
  );
}

/** 상세의 알약. 상세 응답으로 내 게시물과 주제 날짜가 확정된 뒤에만 그려진다(FeedScreen의 renderAiReview). */
export function FeedAiReview({
  postId,
  topicDate,
  entry,
}: {
  postId: string;
  topicDate: KstDate;
  entry?: 'normal' | 'push';
}) {
  return <AiReviewHost postId={postId} topicDate={topicDate} surface="feed" entry={entry} />;
}

/** 홈 카드. 홈이 넘겨 준 오늘 주제 날짜(카드를 보이는 조건)로 요청 자격을 판정한다. */
export function HomeAiCard({ postId, topicDate }: { postId: string; topicDate: KstDate }) {
  return <AiReviewHost postId={postId} topicDate={topicDate} surface="home" />;
}
