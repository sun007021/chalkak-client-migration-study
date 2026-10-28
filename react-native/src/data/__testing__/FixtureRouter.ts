import type { HttpRequest, HttpResponse } from '../../core/http/HttpTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import type { FakeTransport } from '../../core/http/__testing__/FakeTransport';

type Outcome = HttpResponse | Error;
type Step = string | Outcome;

/**
 * 라우트 값. 문자열은 fixture 이름(`home/posts-today__not-posted`), 배열은 호출 순서대로 하나씩 소비하고 마지막을 반복,
 * 함수는 호출마다 계산(지연은 deferred를 기다리게 하면 된다). Error는 throw된다.
 */
export type RouteValue =
  | Step
  | readonly Step[]
  | ((request: HttpRequest, callIndex: number) => Outcome | Promise<Outcome>);

type Route = {
  method: string;
  path: string;
  query: Record<string, string>;
  value: RouteValue;
  calls: HttpRequest[];
};

function parseKey(key: string): Omit<Route, 'value' | 'calls'> {
  const space = key.indexOf(' ');
  const method = key.slice(0, space);
  const url = new URL(key.slice(space + 1), 'https://route.test');
  return {
    method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
  };
}

const toOutcome = (step: Step): Outcome =>
  typeof step === 'string' ? fixtureResponse(step) : step;

/**
 * 요청의 메서드·경로·쿼리로 fixture 응답을 고르는 FakeTransport 핸들러.
 * 키 형식: `GET /topics?date=2026-10-27`. 라우트의 쿼리가 요청 쿼리의 부분집합이면 일치하고, 쿼리 항목이 더 많은 라우트가 우선한다.
 * 어떤 라우트와도 맞지 않는 요청은 오류(예상하지 못한 호출이 조용히 지나가지 않게).
 */
export class FixtureRouter {
  private readonly routes = new Map<string, Route>();

  constructor(table: Record<string, RouteValue> = {}) {
    for (const [key, value] of Object.entries(table)) this.set(key, value);
  }

  /** 라우트를 추가하거나 교체한다(호출 기록도 새로 시작). */
  set(key: string, value: RouteValue): this {
    this.routes.set(key, { ...parseKey(key), value, calls: [] });
    return this;
  }

  remove(key: string): this {
    this.routes.delete(key);
    return this;
  }

  install(transport: FakeTransport): this {
    transport.respond((request) => this.handle(request));
    return this;
  }

  /** 키와 일치한 요청들(교체 전 호출은 포함하지 않는다). */
  calls(key: string): HttpRequest[] {
    return this.routes.get(key)?.calls ?? [];
  }

  private async handle(request: HttpRequest): Promise<HttpResponse> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/v1/, '');
    let best: Route | undefined;
    for (const route of this.routes.values()) {
      if (route.method !== request.method || route.path !== path) continue;
      const matches = Object.entries(route.query).every(([k, v]) => url.searchParams.get(k) === v);
      if (!matches) continue;
      if (!best || Object.keys(route.query).length > Object.keys(best.query).length) best = route;
    }
    if (!best) throw new Error(`예상하지 못한 요청 ${request.method} ${path}${url.search}`);
    const index = best.calls.length;
    best.calls.push(request);
    const { value } = best;
    let outcome: Outcome;
    if (typeof value === 'function') outcome = await value(request, index);
    else if (Array.isArray(value)) {
      const steps = value as readonly Step[];
      outcome = toOutcome(steps[Math.min(index, steps.length - 1)]);
    } else outcome = toOutcome(value as Step);
    if (outcome instanceof Error) throw outcome;
    return outcome;
  }
}
