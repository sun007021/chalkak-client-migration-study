/** 목록·피드·홈이 같이 쓰는 좋아요 값(D-04). 서버 확정 값이거나 낙관적 값이다. */
export type LikeSnapshot = { postId: string; likeCount: number; isLiked: boolean };

export type LikeChange =
  /** 낙관적 갱신, 롤백, 서버 확정 모두 이 이벤트로 온다. */
  | { kind: 'updated'; snapshot: LikeSnapshot }
  /** 404(삭제·비공개): 롤백 후 목록에서 뺀다. */
  | { kind: 'removed'; postId: string };

/**
 * 좋아요 낙관적 갱신·롤백·직렬화·토스트를 맡는 공용 컨트롤러(PR6에서 구현, D-04).
 * 홈은 "누르면 위임하고, 알려 주는 결과 값으로 목록을 그린다"까지만 안다.
 * 게스트 판단(D-05)은 호출하는 화면이 한다: 게스트면 toggle을 부르지 않는다.
 */
export interface LikeController {
  /** 보이는 값(current)을 뒤집는 쪽으로 즉시 낙관적 갱신을 시작한다. 결과는 subscribe로 온다. */
  toggle(current: LikeSnapshot): void;
  /** 컨트롤러가 가진 최신 값(진행 중 낙관 값 포함). 없으면 undefined. */
  snapshot(postId: string): LikeSnapshot | undefined;
  subscribe(listener: (change: LikeChange) => void): () => void;
}
