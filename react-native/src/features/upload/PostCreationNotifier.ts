import type { KstDate } from '../../core/time/KstDate';
import type { TodayModerationStatus } from '../../data/post/PostModels';

export type PostCreatedEvent = {
  postId: string;
  topicDate: KstDate;
  moderationStatus: TodayModerationStatus;
};

/**
 * 게시물이 만들어졌음을 다른 화면에 알리는 최소 통로(REQ-UPL-063): 홈(히어로·AI 카드·이번 주 기록), 기록(그 달 캐시), 전시 캐시가 다시 불러온다.
 * 표시 PR의 `PostChanges`(features/post)가 들어오면 그 인터페이스로 합치거나 이 인터페이스를 구현하는 어댑터로 바꾼다.
 */
export interface PostCreationNotifier {
  postCreated(event: PostCreatedEvent): void;
}
