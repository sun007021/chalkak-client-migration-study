import type { PostSummary } from '../../data/post/PostModels';

export interface DisplayNavigator {
  /** 목록의 게시물을 시드로 상세를 연다(상세 응답 전에도 이미지·좋아요 값이 보인다, TC-DISP-055). */
  openPostDetail(target: { postId: string; seed: PostSummary }): void;
}
