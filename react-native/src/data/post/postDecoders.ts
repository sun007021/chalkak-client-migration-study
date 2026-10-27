import type { CalendarMonth, PostListPage, TodayPost } from './PostModels';

/** 아래 디코더는 모양이 어긋나면 throw한다(ApiClient가 InvalidResponseError로 바꾼다). nullable 필드는 생략·null 모두 받는다(TC-NET-010). */

export function decodePostListPage(_raw: unknown): PostListPage {
  throw new Error('not implemented');
}

/** isPosted와 postId/moderationStatus가 어긋나거나 moderationStatus가 VALIDATING/PENDING/APPROVED가 아니면 throw. */
export function decodeTodayPost(_raw: unknown): TodayPost {
  throw new Error('not implemented');
}

/** status가 PENDING/APPROVED가 아니거나 topicDate가 yyyy-MM-dd가 아니면 throw. */
export function decodeCalendarMonth(_raw: unknown): CalendarMonth {
  throw new Error('not implemented');
}
