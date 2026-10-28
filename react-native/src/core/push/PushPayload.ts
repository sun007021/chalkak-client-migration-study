/** 푸시 `data`에서 읽은 값. 문자열이 아니거나 빈 값은 null(누락)로 본다. */
export type PushPayload = {
  type: string | null;
  notificationId: string | null;
  sourceType: string | null;
  sourceId: string | null;
  eventId: string | null;
};

const text = (raw: Record<string, unknown>, key: string): string | null => {
  const value = raw[key];
  return typeof value === 'string' && value !== '' ? value : null;
};

/** iOS userInfo(평탄), Android extras, 플러그인 래퍼가 모두 같은 최상위 키 맵으로 들어온다(TC-PUSH-050). 예외를 던지지 않는다. */
export function parsePushPayload(raw: unknown): PushPayload {
  const map =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    type: text(map, 'type'),
    notificationId: text(map, 'notificationId'),
    sourceType: text(map, 'sourceType'),
    sourceId: text(map, 'sourceId'),
    eventId: text(map, 'eventId'),
  };
}
