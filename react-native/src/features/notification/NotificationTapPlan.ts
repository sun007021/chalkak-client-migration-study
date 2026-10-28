/** 알림함 행·푸시 payload에서 목적지를 정하는 입력. 문자열이 아니거나 없으면 null. */
export type NotificationTapInput = {
  type: string | null;
  notificationId: string | null;
  sourceType: string | null;
  sourceId: string | null;
};

/**
 * D-11 목적지 표. 읽음 요청이 필요한 계획(post, detail)은 notificationId가 유효한 UUID(소문자 정규형)다.
 * invalid: 알 수 없는 type, 필수 필드 누락, UUID 형식 위반, AI 리뷰인데 sourceType이 POST가 아님.
 */
export type NotificationTapPlan =
  | { kind: 'home'; refreshHome: boolean }
  | { kind: 'post'; notificationId: string; postId: string; openAiSheet: boolean }
  | { kind: 'detail'; notificationId: string }
  | { kind: 'invalid' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVALID: NotificationTapPlan = { kind: 'invalid' };

const uuid = (value: string | null): string | null =>
  value !== null && UUID.test(value) ? value.toLowerCase() : null;

export function planNotificationTap(input: NotificationTapInput): NotificationTapPlan {
  switch (input.type) {
    case 'TOPIC':
      return { kind: 'home', refreshHome: true };
    case 'REMINDER':
      return { kind: 'home', refreshHome: false };
    case 'POST_APPROVED':
    case 'AI_REVIEW_COMPLETED':
    case 'AI_REVIEW_FAILED': {
      const notificationId = uuid(input.notificationId);
      const postId = uuid(input.sourceId);
      const isAi = input.type !== 'POST_APPROVED';
      if (notificationId === null || postId === null) return INVALID;
      if (isAi && input.sourceType !== 'POST') return INVALID;
      return { kind: 'post', notificationId, postId, openAiSheet: isAi };
    }
    case 'POST_REJECTED':
    case 'NOTICE': {
      const notificationId = uuid(input.notificationId);
      return notificationId === null ? INVALID : { kind: 'detail', notificationId };
    }
    default:
      return INVALID;
  }
}
