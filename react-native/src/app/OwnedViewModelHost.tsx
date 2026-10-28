import type { ReactNode } from 'react';

import { useOwnedViewModel } from './useOwnedViewModel';

/**
 * ViewModel을 구독 시점에 만들고 사라질 때 dispose하는 호스트(useOwnedViewModel의 컴포넌트 형태).
 * `create`는 처음 한 번만 쓰이므로 대상이 바뀌면 부모가 `key`를 바꿔 새로 마운트한다.
 */
export function OwnedViewModelHost<T extends { dispose(): void }>({
  create,
  children,
}: {
  create: () => T;
  children: (viewModel: T) => ReactNode;
}) {
  const viewModel = useOwnedViewModel(create);
  return viewModel ? <>{children(viewModel)}</> : null;
}
