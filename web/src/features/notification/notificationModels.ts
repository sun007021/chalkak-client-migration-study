/** 서버가 보내는 알림 type(API §1.5, §7.1). 목록 항목의 type은 알 수 없는 값도 올 수 있어 문자열로 둔다(REQ-NOTI-021). */
export const NOTIFICATION_TYPES = ['POST_APPROVED', 'POST_REJECTED', 'AI_REVIEW_COMPLETED', 'AI_REVIEW_FAILED', 'NOTICE', 'TOPIC', 'REMINDER'] as const;
export type KnownNotificationType = (typeof NOTIFICATION_TYPES)[number];

/** GET /notifications 항목(API §1.5). 시각은 모두 epoch ms(UTC Instant, 소수 초 유무 모두). null 필드는 생략돼도 null이다. */
export interface NotificationItem {
  /** 소문자 정규형이 아닐 수 있다(요청 때 소문자로 보낸다). */
  id: string;
  /** 알 수 없는 값도 그대로 둔다(항목은 목록에 보이되 탭해도 아무 일이 없다). */
  type: string;
  sourceType: string | null;
  sourceId: string | null;
  title: string;
  body: string;
  thumbnailImageUrl: string | null;
  /** null이면 읽지 않은 알림. */
  readAt: number | null;
  createdAt: number;
}

export interface NotificationsPage {
  currentPage: number;
  pageSize: number;
  hasNext: boolean;
  notifications: NotificationItem[];
}

/** GET /notifications/{id}(API §4.3). */
export interface NotificationDetail {
  id: string;
  type: string;
  title: string;
  body: string;
  originalImageUrl: string | null;
  rejectionReason: string | null;
  readAt: number | null;
  createdAt: number;
}
