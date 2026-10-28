import type { KstDate } from '../../core/time/KstDate';
import {
  asArray,
  asObject,
  bool,
  instant,
  kstDate,
  nonNegInt,
  oneOf,
  optStr,
  str,
  type Obj,
} from '../decode';
import type {
  CalendarEntry,
  CalendarMonth,
  CalendarStatus,
  PostDetail,
  PostListPage,
  PostSummary,
  TitleUpdateResult,
  TodayModerationStatus,
  TodayPost,
} from './PostModels';

/** 아래 디코더는 모양이 어긋나면 throw한다(ApiClient가 InvalidResponseError로 바꾼다). nullable 필드는 생략·null 모두 받는다(TC-NET-010). */

const MODERATION: readonly TodayModerationStatus[] = ['VALIDATING', 'PENDING', 'APPROVED'];
const CALENDAR_STATUS: readonly CalendarStatus[] = ['PENDING', 'APPROVED'];

export function decodePostListPage(raw: unknown): PostListPage {
  const o = asObject(raw, 'post list');
  return {
    currentPage: nonNegInt(o, 'currentPage'),
    pageSize: nonNegInt(o, 'pageSize'),
    hasNext: bool(o, 'hasNext'),
    posts: asArray(o.posts, 'posts').map(decodePostSummary),
  };
}

function decodePostSummary(raw: unknown): PostSummary {
  const o = asObject(raw, 'post');
  return {
    id: str(o, 'id'),
    authorId: str(o, 'authorId'),
    originalImageUrl: str(o, 'originalImageUrl'),
    thumbnailImageUrl: optStr(o, 'thumbnailImageUrl'),
    signatureOriginalImageUrl: str(o, 'signatureOriginalImageUrl'),
    signatureThumbnailImageUrl: optStr(o, 'signatureThumbnailImageUrl'),
    title: optStr(o, 'title'),
    submittedAt: instant(o, 'submittedAt'),
    likeCount: nonNegInt(o, 'likeCount'),
    isLiked: bool(o, 'isLiked'),
    isMine: bool(o, 'isMine'),
  };
}

/** isPosted와 postId/moderationStatus가 어긋나거나 moderationStatus가 VALIDATING/PENDING/APPROVED가 아니면 throw. */
export function decodeTodayPost(raw: unknown): TodayPost {
  const o: Obj = asObject(raw, 'today post');
  const topicDate: KstDate = kstDate(o, 'topicDate');
  if (!bool(o, 'isPosted')) {
    if (optStr(o, 'postId') !== null || optStr(o, 'moderationStatus') !== null) {
      throw new Error('isPosted=false must not carry postId or moderationStatus');
    }
    return { topicDate, isPosted: false };
  }
  return {
    topicDate,
    isPosted: true,
    postId: str(o, 'postId'),
    moderationStatus: oneOf(o, 'moderationStatus', MODERATION),
  };
}

/** status가 PENDING/APPROVED가 아니거나 topicDate가 yyyy-MM-dd가 아니면 throw. */
export function decodeCalendarMonth(raw: unknown): CalendarMonth {
  const o = asObject(raw, 'calendar');
  return {
    year: nonNegInt(o, 'year'),
    month: nonNegInt(o, 'month'),
    posts: asArray(o.posts, 'posts').map(decodeCalendarEntry),
  };
}

function decodeCalendarEntry(raw: unknown): CalendarEntry {
  const o = asObject(raw, 'calendar entry');
  return {
    topicDate: kstDate(o, 'topicDate'),
    postId: str(o, 'postId'),
    thumbnailImageUrl: optStr(o, 'thumbnailImageUrl'),
    status: oneOf(o, 'status', CALENDAR_STATUS),
  };
}

/** 필수 필드 누락·likeCount 문자열/음수·topic 누락이면 throw. thumbnailImageUrl은 null 허용. */
export function decodePostDetail(_raw: unknown): PostDetail {
  throw new Error('not implemented');
}

/** `{postId, title}`; title은 null 허용. */
export function decodeTitleUpdate(_raw: unknown): TitleUpdateResult {
  throw new Error('not implemented');
}
