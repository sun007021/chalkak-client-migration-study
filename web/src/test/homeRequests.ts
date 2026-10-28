import type { FakeFetch, RecordedRequest } from './fakeFetch';

/** 실제 홈 화면이 열리면서 보내는 읽기 요청(주제·랭킹·히어로·주간·미읽음·배너·AI 상태). 홈 밖의 동작을 검증하는 테스트가 "요청 0건"을 볼 때 뺀다. */
const HOME_PATHS = new Set(['/topics', '/posts', '/posts/today', '/posts/calendar', '/notifications/unread-status', '/banners']);
const AI_REVIEW_GET = /^\/posts\/[0-9a-f-]{36}\/ai-review$/;

export const isHomeLoadRequest = (call: Pick<RecordedRequest, 'method' | 'path'>): boolean =>
  call.method === 'GET' && (HOME_PATHS.has(call.path) || AI_REVIEW_GET.test(call.path));

/** 홈이 스스로 보낸 읽기 요청을 뺀 호출 기록. */
export const outsideHome = (ff: Pick<FakeFetch, 'calls'>): RecordedRequest[] => ff.calls.filter((call) => !isHomeLoadRequest(call));

/** 게스트에게 금지된 회원 전용 읽기 API(D-05, REQ-HOME-012). */
const MEMBER_ONLY_PATHS = new Set(['/posts/today', '/posts/calendar', '/notifications/unread-status']);
const isMemberOnly = (call: Pick<RecordedRequest, 'path'>): boolean => MEMBER_ONLY_PATHS.has(call.path) || AI_REVIEW_GET.test(call.path) || call.path.endsWith('/ai-review');

/**
 * 게스트 화면의 요청 단언: 회원 전용 API(/posts/today, /posts/calendar, 미읽음, ai-review)는 0건, 어떤 요청에도 Authorization이 없고,
 * 홈이 보내는 공개 읽기(주제·랭킹·배너) 말고는 요청이 없다(로그인·갱신 등 인증 API 0건).
 */
export function expectGuestRequestsOnlyPublic(ff: Pick<FakeFetch, 'calls'>): void {
  expect(ff.calls.filter(isMemberOnly)).toEqual([]);
  expect(ff.calls.filter((call) => call.headers['authorization'] !== undefined)).toEqual([]);
  expect(outsideHome(ff)).toEqual([]);
}
