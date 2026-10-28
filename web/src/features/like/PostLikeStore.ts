import type { ToastController } from '../../core/ui/ToastController';
import type { PostChanges } from '../post/PostChanges';
import type { LikeTarget, LikeValue } from '../post/postModels';
import type { LikeRepository } from './LikeRepository';

/** 읽기 요청(목록·상세)을 보내기 직전의 표시. merge에 그대로 돌려준다. */
export type ReadStamp = number;

export interface PostLikeStoreDeps {
  repository: LikeRepository;
  changes: PostChanges;
  toast: ToastController;
}

/**
 * 모든 화면(전시·홈 랭킹·상세)이 공유하는 좋아요 상태와 직렬화(D-04). 컨테이너가 하나를 들고 UserCaches로 reset한다.
 * - toggle은 누르는 즉시 isLiked를 뒤집고 likeCount를 ±1(0 아래로는 내리지 않음)해 PostChanges에 {type:'like'}로 알린다.
 * - 게시물마다 동시 요청은 최대 1개다. 진행 중에 누르면 마지막 의도만 기억하고, 응답 뒤 의도와 서버 상태가 다르면 한 번 더 보낸다.
 *   성공 응답의 likeCount·isLiked로 덮어쓴다(그 사이 의도가 바뀌었으면 의도 쪽 isLiked와 응답 likeCount±1).
 * - 실패(네트워크·5xx·계약 위반)는 서버 확정 값으로 되돌리고 `like.error.generic` 토스트. PUT 403은 `like.error.banned` 토스트이고 같은 요청을 다시 보내지 않는다.
 *   404는 되돌린 뒤 {type:'removed'}를 알리고 `like.error.generic` 토스트. 롤백 결과가 이미 마지막 의도와 같으면 추가 요청 없이 토스트만.
 * - 게스트 판정(D-05)은 호출자(ViewModel)가 GuestGate로 먼저 하고, 여기는 회원만 부른다.
 */
export class PostLikeStore {
  constructor(protected readonly deps: PostLikeStoreDeps) {}

  /** 읽기 요청을 보내기 직전에 부른다. */
  beginRead(): ReadStamp {
    throw new Error('not implemented');
  }

  /**
   * 읽기 응답의 좋아요 값을 보정한다: 그 읽기를 시작한 뒤 좋아요가 바뀌었거나(낙관·확정·롤백 모두) 지금 요청이 진행 중인 게시물은 지금 값으로 바꾸고,
   * 나머지는 응답 값 그대로 돌려준다(REQ-LIKE-009).
   */
  merge<T extends LikeTarget>(_items: readonly T[], _stamp: ReadStamp): T[] {
    throw new Error('not implemented');
  }

  /** 지금 화면에 보여야 하는 값(낙관 포함). 이 세션에서 좋아요 활동이 없었으면 undefined. */
  current(_postId: string): LikeValue | undefined {
    throw new Error('not implemented');
  }

  /** 요청이 진행 중인가. */
  isPending(_postId: string): boolean {
    throw new Error('not implemented');
  }

  /**
   * 하트 누름. base는 화면이 지금 보여 주는 값(요청이 진행 중이 아니면 이 값에서 시작한다).
   * 돌려준 약속은 이 게시물의 직렬화된 요청이 모두 끝나면 이행된다(진행 중에 누른 호출은 바로 이행되어도 된다).
   */
  toggle(_base: LikeTarget): Promise<void> {
    throw new Error('not implemented');
  }

  /** 계정 전환·로그아웃: 상태를 모두 버리고 진행 중이던 응답은 무시한다(TC-LIKE-031). */
  reset(): void {
    throw new Error('not implemented');
  }
}
