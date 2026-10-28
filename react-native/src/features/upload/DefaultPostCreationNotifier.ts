import type { PostCreatedEvent, PostCreationNotifier } from './PostCreationNotifier';

/**
 * 게시물이 만들어졌음을 구독자(홈, 기록, 전시)에게 알린다. `PostChanges`(features/post)는 기존 게시물의 변경(제목 수정·삭제) 채널이라
 * 구독자가 `deleted` 말고는 모두 제목 변경으로 읽는다. 그 의미와 맞지 않아 `created`를 섞지 않고 별도 채널로 둔다.
 * 한 구독자의 예외가 나머지를 막지 않는다.
 */
export class DefaultPostCreationNotifier implements PostCreationNotifier {
  private readonly listeners = new Set<(event: PostCreatedEvent) => void>();

  postCreated(event: PostCreatedEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        console.error(error);
      }
    }
  }

  subscribe(listener: (event: PostCreatedEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
