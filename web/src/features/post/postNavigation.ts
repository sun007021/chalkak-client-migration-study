import { feedPath } from '../../app/paths';
import { feedLocationState } from '../feed/feedNavigation';
import type { PostSeed } from './postModels';

/** 전시(와 이후 기록)가 게시물 상세를 여는 통로. 홈의 HomeNavigator.openPostDetail과 같은 모양이다. */
export interface PostDetailNavigator {
  openPostDetail(target: { postId: string; seed: PostSeed }): void;
}

export type NavigateFn = (to: string, options?: { state?: unknown }) => void | Promise<void>;

/** 오래 사는 ViewModel이 화면 수명과 무관하게 들고 있는 PostDetailNavigator. 화면이 붙어 있는 동안만 실제 구현을 꽂고, 붙어 있지 않을 때의 요청은 버린다. */
export class AttachablePostNavigator implements PostDetailNavigator {
  private target: PostDetailNavigator | null = null;

  /** 붙인다. 돌려준 함수로 뗀다(그 사이 다른 구현이 붙었으면 건드리지 않는다). */
  attach(target: PostDetailNavigator): () => void {
    this.target = target;
    return () => {
      if (this.target === target) this.target = null;
    };
  }

  openPostDetail(target: { postId: string; seed: PostSeed }): void {
    this.target?.openPostDetail(target);
  }
}

/** react-router navigate로 `/feed/{postId}`(feedPath)를 push하고 state는 feedLocationState(seed)다. */
export class RouterPostNavigator implements PostDetailNavigator {
  constructor(private readonly navigate: NavigateFn) {}

  openPostDetail(target: { postId: string; seed: PostSeed }): void {
    void this.navigate(feedPath(target.postId), { state: feedLocationState(target.seed) });
  }
}
