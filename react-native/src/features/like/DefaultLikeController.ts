import type { UserDataCache } from '../../core/push/UserDataCache';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type { LikeApi } from '../../data/like/LikeRepository';
import type { AuthFlowNavigator } from '../auth/AuthFlowNavigator';
import type { LikeChange, LikeController, LikeSnapshot } from './LikeController';

export type DefaultLikeControllerDeps = {
  api: LikeApi;
  toast: ToastPresenter;
  /** 재인증 필요(401)면 롤백 뒤 로그인으로 보낸다(D-17). */
  authFlow: Pick<AuthFlowNavigator, 'toLogin'>;
};

/**
 * D-04 구현. 화면들이 공유하는 좋아요 저장소이기도 하다(전시·홈·피드가 같은 인스턴스를 구독한다).
 * - toggle: 즉시 낙관 갱신(updated). 게시물마다 요청은 한 번에 하나, 진행 중 탭은 마지막 의도만 기억한다.
 * - 응답 뒤 최종 의도와 서버 상태가 다르면 한 번 더 보낸다. 성공 응답 값으로 덮어쓴다.
 * - 실패는 롤백(updated)과 토스트. 404는 removed, 403(PUT)은 정지 문구 + 재요청 없음.
 * - clearAll(계정 전환)이면 진행 중 응답을 무시하고 저장된 값을 비운다.
 */
export class DefaultLikeController implements LikeController, UserDataCache {
  constructor(private readonly deps: DefaultLikeControllerDeps) {}

  toggle(_current: LikeSnapshot): void {
    void this.deps;
    throw new Error('not implemented');
  }

  snapshot(_postId: string): LikeSnapshot | undefined {
    throw new Error('not implemented');
  }

  subscribe(_listener: (change: LikeChange) => void): () => void {
    throw new Error('not implemented');
  }

  revision(): number {
    throw new Error('not implemented');
  }

  latestSince(_postId: string, _since: number): LikeSnapshot | undefined {
    throw new Error('not implemented');
  }

  clearAll(): void {
    throw new Error('not implemented');
  }
}
