import { useCallback, useEffect, useRef, useState } from 'react';

import type { FeedNavigator } from '../features/feed/FeedNavigator';
import { FeedScreen } from '../features/feed/FeedScreen';
import type { FeedTarget } from '../features/feed/FeedTarget';
import { FeedAiReview } from './AiReviewHosts';
import { useAppContainer } from './AppContainerContext';
import { useOwnedViewModel } from './useOwnedViewModel';

/**
 * 게시물 상세 화면의 소유자. 상세 ViewModel은 화면이 아니라 이 라우트가 만들고 라우트가 사라질 때 dispose한다
 * (IssueWebRoute와 같은 방식, StrictMode 안전). 로그인 userId는 비동기로 읽으므로 읽은 뒤에 만든다.
 */
export function PostDetailRoute({
  target,
  onBack,
  openAiSheet = false,
  onAiSheetConsumed,
}: {
  target: FeedTarget;
  onBack: () => void;
  /** 푸시 AI 리뷰 탭으로 열렸다(D-11): AI 피드백 시트를 한 번 자동으로 연다. */
  openAiSheet?: boolean;
  /** 이 진입 플래그를 쓴 뒤 라우트 파라미터에서 지우게 한다(상세로 다시 돌아와도 시트가 다시 열리지 않는다). */
  onAiSheetConsumed?: () => void;
}) {
  const { sessionStore } = useAppContainer();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    sessionStore
      .load()
      .then((session) =>
        // 게스트는 상세에 들어올 수 없지만(D-05) 혹시 와도 내 게시물로 판정되지 않게 빈 값을 둔다.
        session.kind === 'authenticated' ? session.credentials.userId : '',
      )
      // 세션을 못 읽어도 화면은 열어야 한다(내 게시물 판정만 포기한다).
      .catch(() => '')
      .then((id) => {
        if (!cancelled) setUserId(id);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionStore]);

  if (userId === null) return null;
  return (
    <OwnedFeed
      key={target.postId}
      target={target}
      userId={userId}
      onBack={onBack}
      openAiSheet={openAiSheet}
      onAiSheetConsumed={onAiSheetConsumed}
    />
  );
}

function OwnedFeed({
  target,
  userId,
  onBack,
  openAiSheet,
  onAiSheetConsumed,
}: {
  target: FeedTarget;
  userId: string;
  onBack: () => void;
  openAiSheet: boolean;
  onAiSheetConsumed?: () => void;
}) {
  const container = useAppContainer();
  // 진입 플래그는 처음 한 번만 읽고(파라미터를 지워도 값이 바뀌지 않게) 곧바로 소비한다.
  const [pushEntry] = useState(openAiSheet);
  const consumedRef = useRef(onAiSheetConsumed);
  useEffect(() => {
    consumedRef.current = onAiSheetConsumed;
  }, [onAiSheetConsumed]);
  useEffect(() => {
    if (pushEntry) consumedRef.current?.();
  }, [pushEntry]);
  // create는 처음 한 번만 쓰이므로, 나중에 바뀌는 onBack은 ref로 최신 값을 읽는다.
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);
  const create = useCallback(() => {
    // 닫기 요청이 겹쳐도(삭제 성공 + 좋아요 404 등) 한 번만 이전 화면으로 돌아간다.
    let closed = false;
    const navigator: FeedNavigator = {
      close: () => {
        if (closed) return;
        closed = true;
        onBackRef.current();
      },
    };
    return container.createFeedViewModel(target, userId, navigator);
  }, [container, target, userId]);
  const viewModel = useOwnedViewModel(create);
  if (!viewModel) return null;
  return (
    <FeedScreen
      viewModel={viewModel}
      renderAiReview={({ postId, topicDate }) => (
        <FeedAiReview postId={postId} topicDate={topicDate} entry={pushEntry ? 'push' : 'normal'} />
      )}
    />
  );
}
