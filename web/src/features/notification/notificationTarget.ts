import type { NotificationItem } from './notificationModels';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 읽음 처리 뒤에 열 화면. postId·notificationId는 소문자 정규형이다. */
export type NotificationDestination =
  /** 게시물 상세(내 게시물). openAiReview면 location.state { openAiReview: true }로 AI 시트를 최신 GET 기준 한 번 자동으로 연다. */
  | { kind: 'post'; postId: string; openAiReview: boolean }
  /** 알림 상세. 알림 자신의 id(공지의 sourceId가 아니다). */
  | { kind: 'detail'; notificationId: string };

/**
 * 알림함 행을 눌렀을 때 할 일(D-11 목적지 표, REQ-NOTI-015·021·022).
 * - ignore: 이동도 읽음 요청도 없다(알 수 없는 type, 필요한 필드 누락·UUID 아님, AI 알림인데 sourceType이 POST가 아님).
 * - home: TOPIC·REMINDER. 읽음 요청 없이 홈으로(Q-11).
 * - read: 단건 읽음 요청 뒤 destination으로.
 */
export type RowTapPlan = { kind: 'ignore' } | { kind: 'home' } | { kind: 'read'; destination: NotificationDestination };

/**
 * type별 규칙: POST_APPROVED → 게시물 상세(sourceType이 POST이고 sourceId가 UUID일 때만), AI_REVIEW_COMPLETED·AI_REVIEW_FAILED → 같은 조건의 게시물 상세 + openAiReview,
 * POST_REJECTED·NOTICE → 알림 상세(item.id가 UUID일 때만), TOPIC·REMINDER → home, 그 밖 → ignore. UUID는 대소문자를 구분하지 않고 결과는 소문자로 만든다.
 * 문구(title·body)는 보지 않는다(REQ-NOTI-004).
 */
export function planRowTap(item: Pick<NotificationItem, 'id' | 'type' | 'sourceType' | 'sourceId'>): RowTapPlan {
  switch (item.type) {
    case 'POST_APPROVED':
    case 'AI_REVIEW_COMPLETED':
    case 'AI_REVIEW_FAILED': {
      if (item.sourceType !== 'POST' || item.sourceId === null || !UUID.test(item.sourceId)) return { kind: 'ignore' };
      return { kind: 'read', destination: { kind: 'post', postId: item.sourceId.toLowerCase(), openAiReview: item.type !== 'POST_APPROVED' } };
    }
    case 'POST_REJECTED':
    case 'NOTICE':
      if (!UUID.test(item.id)) return { kind: 'ignore' };
      return { kind: 'read', destination: { kind: 'detail', notificationId: item.id.toLowerCase() } };
    case 'TOPIC':
    case 'REMINDER':
      return { kind: 'home' };
    default:
      return { kind: 'ignore' };
  }
}
