import type { FakeFetch, RecordedRequest } from './fakeFetch';

/** 실제 홈 화면이 열리면서 보내는 읽기 요청(주제·랭킹·히어로·주간·미읽음·배너·AI 상태). 홈 밖의 동작을 검증하는 테스트가 "요청 0건"을 볼 때 뺀다. */
const HOME_PATHS = new Set(['/topics', '/posts', '/posts/today', '/posts/calendar', '/notifications/unread-status', '/banners']);
const AI_REVIEW_GET = /^\/posts\/[0-9a-f-]{36}\/ai-review$/;

export const isHomeLoadRequest = (call: Pick<RecordedRequest, 'method' | 'path'>): boolean =>
  call.method === 'GET' && (HOME_PATHS.has(call.path) || AI_REVIEW_GET.test(call.path));

/** 홈이 스스로 보낸 읽기 요청을 뺀 호출 기록. */
export const outsideHome = (ff: Pick<FakeFetch, 'calls'>): RecordedRequest[] => ff.calls.filter((call) => !isHomeLoadRequest(call));
