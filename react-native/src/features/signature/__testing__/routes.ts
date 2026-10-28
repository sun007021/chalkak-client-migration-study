import { fixtureResponse } from '../../../core/http/__testing__/loadFixture';
import type { FakeTransport } from '../../../core/http/__testing__/FakeTransport';

/** fixture 이름(`onboarding/signup__success`) 또는 던질 오류. */
export type RouteStep = string | Error;

/**
 * `METHOD /path`(`/api/v1` 제외)별로 fixture 응답을 순서대로 돌려준다. 배열이면 호출 순서대로 쓰고 마지막 항목을 반복한다.
 * presigned PUT(`/__upload/...`)은 `PUT /__upload` 한 키로 받는다. 정해지지 않은 요청은 오류.
 */
export function routeFixtures(
  transport: FakeTransport,
  table: Record<string, RouteStep | RouteStep[]>,
): void {
  const counts = new Map<string, number>();
  transport.respond((request) => {
    const path = new URL(request.url).pathname.replace(/^\/api\/v1/, '');
    const key = path.startsWith('/__upload/')
      ? `${request.method} /__upload`
      : `${request.method} ${path}`;
    const entry = table[key];
    if (entry === undefined) throw new Error(`예상하지 못한 요청 ${key}`);
    const steps = Array.isArray(entry) ? entry : [entry];
    const n = counts.get(key) ?? 0;
    counts.set(key, n + 1);
    const step = steps[Math.min(n, steps.length - 1)];
    if (step instanceof Error) throw step;
    return fixtureResponse(step);
  });
}
