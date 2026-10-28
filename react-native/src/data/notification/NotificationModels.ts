import { asArray, asObject, bool, instant, nonNegInt, optStr, str, type Obj } from '../decode';

/** 알림함 한 줄. type·sourceType은 알 수 없는 값이 올 수 있어 문자열 그대로 둔다(해석은 NotificationTapPlan). */
export type NotificationSummary = {
  id: string;
  type: string;
  sourceType: string | null;
  sourceId: string | null;
  title: string;
  body: string;
  thumbnailImageUrl: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export type NotificationPage = {
  currentPage: number;
  pageSize: number;
  hasNext: boolean;
  notifications: readonly NotificationSummary[];
};

export type NotificationDetail = {
  id: string;
  type: string;
  title: string;
  body: string;
  originalImageUrl: string | null;
  rejectionReason: string | null;
  readAt: Date | null;
  createdAt: Date;
};

const optInstant = (o: Obj, key: string): Date | null =>
  optStr(o, key) === null ? null : instant(o, key);

/** 항목 하나라도 필수 필드가 없으면 throw(응답 전체가 계약 위반, TC-NOTI-008). */
export function decodeNotificationPage(raw: unknown): NotificationPage {
  const o = asObject(raw, 'notification page');
  return {
    currentPage: nonNegInt(o, 'currentPage'),
    pageSize: nonNegInt(o, 'pageSize'),
    hasNext: bool(o, 'hasNext'),
    notifications: asArray(o.notifications, 'notifications').map(decodeSummary),
  };
}

function decodeSummary(raw: unknown): NotificationSummary {
  const o = asObject(raw, 'notification');
  return {
    id: str(o, 'id'),
    type: str(o, 'type'),
    sourceType: optStr(o, 'sourceType'),
    sourceId: optStr(o, 'sourceId'),
    title: str(o, 'title'),
    body: str(o, 'body'),
    thumbnailImageUrl: optStr(o, 'thumbnailImageUrl'),
    readAt: optInstant(o, 'readAt'),
    createdAt: instant(o, 'createdAt'),
  };
}

export function decodeNotificationDetail(raw: unknown): NotificationDetail {
  const o = asObject(raw, 'notification detail');
  return {
    id: str(o, 'id'),
    type: str(o, 'type'),
    title: str(o, 'title'),
    body: str(o, 'body'),
    originalImageUrl: optStr(o, 'originalImageUrl'),
    rejectionReason: optStr(o, 'rejectionReason'),
    readAt: optInstant(o, 'readAt'),
    createdAt: instant(o, 'createdAt'),
  };
}
