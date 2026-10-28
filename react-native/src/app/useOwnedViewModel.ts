import { useState, useSyncExternalStore } from 'react';

/** 구독이 시작될 때 만들고 마지막 구독이 풀리면 dispose하는 저장소. 다시 구독하면 새로 만든다. */
class OwnedViewModelStore<T extends { dispose(): void }> {
  private viewModel: T | null = null;
  private subscribers = 0;

  constructor(private readonly create: () => T) {}

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

  getSnapshot = (): T | null => this.viewModel;
}

/**
 * 라우트(내비게이션 단계)가 ViewModel을 만들고 버리게 하는 훅. dispose는 되돌릴 수 없으므로
 * StrictMode의 mount/unmount/mount에서 죽은 인스턴스를 쓰지 않도록 렌더가 아니라 구독 시점(commit)에 만든다
 * (첫 프레임은 null이다). `create`는 처음 한 번만 쓰인다.
 */
export function useOwnedViewModel<T extends { dispose(): void }>(create: () => T): T | null {
  const [store] = useState(() => new OwnedViewModelStore(create));
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
