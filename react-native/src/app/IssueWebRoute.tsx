import { useCallback, useState, useSyncExternalStore } from 'react';

import { IssueWebScreen } from '../features/banner/IssueWebScreen';
import type { IssueWebViewModel } from '../features/banner/IssueWebViewModel';
import { useAppContainer } from './AppContainerContext';

/**
 * 배너 웹뷰 화면의 소유자. ViewModel은 화면이 아니라 이 내비게이션 단계(라우트)가 만든다.
 * 라우트가 살아 있는 동안 같은 인스턴스를 쓰고, 라우트가 사라지면 dispose한다
 * (진행 중인 외부 열기 결과가 화면 밖에서 토스트로 나오지 않게 한다).
 * dispose는 되돌릴 수 없으므로 StrictMode의 mount/unmount/mount에서 죽은 인스턴스를 쓰지 않도록
 * 렌더가 아니라 구독 시점(commit)에 만들고 마지막 구독이 풀릴 때 dispose한다(첫 프레임은 비어 있다).
 */
export function IssueWebRoute({ url, onBack }: { url: string; onBack: () => void }) {
  const container = useAppContainer();
  const create = useCallback(() => container.createIssueWebViewModel(url), [container, url]);
  const viewModel = useOwnedViewModel(create);
  if (!viewModel) return null;
  return <IssueWebScreen viewModel={viewModel} onBack={onBack} />;
}

/** 구독이 시작될 때 만들고 마지막 구독이 풀리면 dispose하는 저장소. 다시 구독하면 새로 만든다. */
class OwnedViewModelStore {
  private viewModel: IssueWebViewModel | null = null;
  private subscribers = 0;

  constructor(private readonly create: () => IssueWebViewModel) {}

  subscribe = (): (() => void) => {
    this.subscribers += 1;
    this.viewModel ??= this.create();
    return () => {
      this.subscribers -= 1;
      if (this.subscribers > 0) return;
      this.viewModel?.dispose();
      this.viewModel = null;
    };
  };

  getSnapshot = (): IssueWebViewModel | null => this.viewModel;
}

function useOwnedViewModel(create: () => IssueWebViewModel): IssueWebViewModel | null {
  const [store] = useState(() => new OwnedViewModelStore(create));
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
