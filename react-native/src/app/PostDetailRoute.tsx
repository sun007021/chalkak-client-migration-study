import { useCallback, useEffect, useRef, useState } from 'react';

import type { FeedNavigator } from '../features/feed/FeedNavigator';
import { FeedScreen } from '../features/feed/FeedScreen';
import type { FeedTarget } from '../features/feed/FeedTarget';
import { useAppContainer } from './AppContainerContext';
import { useOwnedViewModel } from './useOwnedViewModel';

/**
 * 게시물 상세 화면의 소유자. 상세 ViewModel은 화면이 아니라 이 라우트가 만들고 라우트가 사라질 때 dispose한다
 * (IssueWebRoute와 같은 방식, StrictMode 안전). 로그인 userId는 비동기로 읽으므로 읽은 뒤에 만든다.
 */
export function PostDetailRoute({ target, onBack }: { target: FeedTarget; onBack: () => void }) {
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
  return <OwnedFeed key={target.postId} target={target} userId={userId} onBack={onBack} />;
}

function OwnedFeed({
  target,
  userId,
  onBack,
}: {
  target: FeedTarget;
  userId: string;
  onBack: () => void;
}) {
  const container = useAppContainer();
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
  return <FeedScreen viewModel={viewModel} />;
}
