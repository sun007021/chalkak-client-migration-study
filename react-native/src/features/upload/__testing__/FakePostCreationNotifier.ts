import type { PostCreatedEvent, PostCreationNotifier } from '../PostCreationNotifier';

export class FakePostCreationNotifier implements PostCreationNotifier {
  readonly events: { postId: string; topicDate: string; moderationStatus: string }[] = [];

  postCreated(event: PostCreatedEvent): void {
    this.events.push({
      postId: event.postId,
      topicDate: event.topicDate.toString(),
      moderationStatus: event.moderationStatus,
    });
  }
}
